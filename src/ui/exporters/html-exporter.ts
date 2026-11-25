import { CONTAINER_TYPES } from '../../shared/constants';
import type { ConversionReport, SerializedDocument, SerializedNode } from '../../shared/types';
import type { ExportContext, ExportFile, ExportOutput, HtmlOptions } from '../types/export-types';
import { extForMime, toDataUrl, utf8 } from '../utilities/base64';
import {
  escapeHtml,
  humanize,
  sanitizeFileName,
  sanitizeId,
  uniqueName,
} from '../utilities/sanitize';
import { sanitizeSvgIds } from '../utilities/svg';
import {
  absoluteStyles,
  autoLayoutToFlex,
  backgroundStyles,
  constraintStyles,
  effectStyles,
  extractVariables,
  flexChildStyles,
  isAutoLayout,
  radiusCss,
  rotationStyles,
  rulesToCss,
  segmentStyles,
  strokeStyles,
  textStyles,
  typographyStyles,
  visualStyles,
  type Rule,
  type StyleEnv,
  type Styles,
} from './css-generator';
import { generateJavaScript } from './javascript-generator';
import { px } from '../utilities/geometry';
import { packageFiles, totalBytes } from './zip-exporter';

export interface HtmlImageInfo {
  nodeId: string;
  name: string;
  alt: string;
}

export interface HtmlGenerateOptions extends HtmlOptions {
  assetMode: 'inline' | 'files';
  altOverrides: Record<string, string>;
}

export interface HtmlResult {
  /** complete single-file document (inline CSS + JS) */
  html: string;
  css: string;
  js: string;
  /** index.html referencing styles.css / script.js (ZIP project mode) */
  indexHtml: string;
  assets: Array<{ name: string; bytes: Uint8Array; mime: string }>;
  images: HtmlImageInfo[];
  warnings: string[];
  nodeCount: number;
  textCount: number;
  rasterized: number;
}

const has = (hay: string, words: string) =>
  new RegExp(`(^|[\\s/_.-])(${words})([\\s/_.-]|$)`).test(hay);

interface Sem {
  tag: string;
  heading?: number;
  inputType?: string;
  wrapNav?: boolean;
  component?: 'tabs' | 'accordion' | 'dropdown' | 'modal' | 'form';
  isImg?: boolean;
}

const visibleFills = (n: SerializedNode) => (n.fills ?? []).filter((f) => f.visible);

function isImageNode(n: SerializedNode): boolean {
  if (n.children?.length || n.svg) return false;
  if (!['RECTANGLE', 'FRAME', 'ELLIPSE', 'COMPONENT', 'INSTANCE'].includes(n.type)) return false;
  const f = visibleFills(n);
  return f.length === 1 && f[0].type === 'IMAGE' && !!f[0].imageHash;
}

const hayOf = (n: SerializedNode) => `${n.componentName ?? ''} ${n.name}`.toLowerCase();

class Builder {
  rules: Rule[] = [];
  warnings: string[] = [];
  features = new Set<string>();
  usedClass = new Set<string>();
  usedDomIds = new Set<string>();
  svgIds = new Set<string>();
  assets = new Map<string, { name: string; bytes: Uint8Array; mime: string }>();
  images: HtmlImageInfo[] = [];
  domIdOf = new Map<string, string>();
  navTargets = new Set<string>();
  overlayTargets = new Set<string>();
  scrollTargets = new Set<string>();
  nodeIndex = new Map<string, SerializedNode>();
  nodeCount = 0;
  textCount = 0;
  rasterized = 0;
  modalIds: string[] = [];
  env: StyleEnv;
  componentStack: string[] = [];
  mobileRows: string[] = [];

  constructor(
    public doc: SerializedDocument,
    public opts: HtmlGenerateOptions,
    public includeHidden: boolean,
  ) {
    this.env = { warn: (m) => this.warn(m), imageUrl: (h) => this.imageUrl(h) };
    this.prescan();
  }

  warn(m: string) {
    if (!this.warnings.includes(m)) this.warnings.push(m);
  }

  imageUrl(hash: string): string | null {
    const img = this.doc.images[hash];
    if (!img) return null;
    if (this.opts.assetMode === 'inline') return toDataUrl(img.bytes, img.mime);
    const name = `assets/${sanitizeId(hash.slice(0, 12), 'img')}.${extForMime(img.mime)}`;
    this.assets.set(name, { name, bytes: img.bytes, mime: img.mime });
    return name;
  }

  prescan() {
    const walk = (n: SerializedNode) => {
      this.nodeIndex.set(n.id, n);
      for (const r of n.reactions ?? []) {
        for (const a of r.actions) {
          if (!a.destinationId) continue;
          if (a.navigation === 'NAVIGATE') this.navTargets.add(a.destinationId);
          else if (a.navigation === 'OVERLAY' || a.navigation === 'SWAP')
            this.overlayTargets.add(a.destinationId);
          else if (a.navigation === 'SCROLL_TO') this.scrollTargets.add(a.destinationId);
        }
      }
      n.children?.forEach(walk);
    };
    this.doc.roots.forEach(walk);
  }

  className(n: SerializedNode): string {
    return uniqueName(sanitizeId(n.name).slice(0, 40), this.usedClass);
  }

  domId(n: SerializedNode, prefix = ''): string {
    let id = this.domIdOf.get(n.id);
    if (!id) {
      id = uniqueName(`${prefix}${sanitizeId(n.name).slice(0, 40)}`, this.usedDomIds);
      this.domIdOf.set(n.id, id);
    }
    return id;
  }

  // ---------------------------------------------------------------- semantics
  infer(n: SerializedNode, parent: SerializedNode | null, parentSem: Sem | null): Sem {
    const hay = hayOf(n);
    if (n.type === 'TEXT') {
      const m = /(^|[\s/_.-])h([1-6])([\s/_.-]|$)/.exec(hay) ?? /heading[\s/_.-]*([1-6])/.exec(hay);
      if (m)
        return { tag: `h${m[m.length === 4 ? 2 : 1]}`, heading: Number(m[m.length === 4 ? 2 : 1]) };
      if (parentSem && ['button', 'a', 'li', 'label'].includes(parentSem.tag))
        return { tag: 'span' };
      const chars = n.characters ?? '';
      return { tag: chars.includes('\n') || chars.length > 60 ? 'p' : 'span' };
    }
    if (n.svg) return { tag: 'svg' };
    if (isImageNode(n)) return { tag: 'img', isImg: true };
    if (parentSem?.tag === 'ul' && CONTAINER_TYPES.includes(n.type)) return { tag: 'li' };
    if (!CONTAINER_TYPES.includes(n.type) && !n.children?.length) {
      return { tag: 'div' };
    }
    if (has(hay, 'button|btn')) return { tag: 'button' };
    if (has(hay, 'input|textfield|text field|text-field|search field|searchbar|search bar|field')) {
      const t = /email/.test(hay)
        ? 'email'
        : /password/.test(hay)
          ? 'password'
          : /search/.test(hay)
            ? 'search'
            : /(phone|tel)/.test(hay)
              ? 'tel'
              : /number/.test(hay)
                ? 'number'
                : /url/.test(hay)
                  ? 'url'
                  : 'text';
      return { tag: 'input', inputType: t };
    }
    const isNav = has(hay, 'nav|navigation|navbar|menu bar');
    const isHeader = has(hay, 'header');
    if (isNav && isHeader) return { tag: 'header', wrapNav: true };
    if (isNav) return { tag: 'nav' };
    if (isHeader) return { tag: 'header' };
    if (has(hay, 'footer')) return { tag: 'footer' };
    if (has(hay, 'form')) return { tag: 'form', component: 'form' };
    if (has(hay, 'list|links') && (n.children?.length ?? 0) >= 2) return { tag: 'ul' };
    if (has(hay, 'tabs?')) return { tag: 'div', component: 'tabs' };
    if (has(hay, 'accordion')) return { tag: 'div', component: 'accordion' };
    if (has(hay, 'dropdown|select|popover') && (n.children?.length ?? 0) >= 2)
      return { tag: 'div', component: 'dropdown' };
    if (has(hay, 'modal|dialog')) return { tag: 'div', component: 'modal' };
    if (has(hay, 'card|article|post')) return { tag: 'article' };
    if (has(hay, 'link|anchor') || this.urlAction(n)) return { tag: 'a' };
    if (n.type === 'SECTION' || has(hay, 'section')) return { tag: 'section' };
    void parent;
    return { tag: 'div' };
  }

  urlAction(n: SerializedNode): string | undefined {
    return n.reactions?.flatMap((r) => r.actions).find((a) => a.type === 'URL' && a.url)?.url;
  }

  interactionAttrs(n: SerializedNode, sem: Sem): Record<string, string | undefined> {
    const attrs: Record<string, string | undefined> = {};
    if (!this.opts.interactions) return attrs;
    const clicks = (n.reactions ?? []).filter((r) => ['ON_CLICK', 'ON_PRESS'].includes(r.trigger));
    let interactive = false;
    for (const r of clicks) {
      for (const a of r.actions) {
        if (a.type === 'URL' && a.url) {
          if (sem.tag === 'a') {
            attrs.href = a.url;
            attrs.target = '_blank';
            attrs.rel = 'noopener noreferrer';
          } else {
            attrs['data-url'] = a.url;
            this.features.add('url');
          }
          interactive = true;
        } else if (a.type === 'BACK') {
          attrs['data-back'] = '';
          interactive = true;
        } else if (a.type === 'CLOSE') {
          attrs['data-close'] = '';
          this.features.add('overlay');
          interactive = true;
        } else if (a.type === 'NODE' && a.destinationId) {
          const dest = this.nodeIndex.get(a.destinationId);
          const isRoot = this.doc.roots.some((r2) => r2.id === a.destinationId);
          if (!dest) {
            this.warn('Prototype link to a frame outside the export scope was ignored');
            continue;
          }
          if (a.navigation === 'NAVIGATE') {
            if (!isRoot) {
              this.warn(`Prototype navigation to nested frame "${dest.name}" was ignored`);
              continue;
            }
            attrs['data-nav'] = this.domId(dest, 'frame-');
            interactive = true;
          } else if (a.navigation === 'OVERLAY' || a.navigation === 'SWAP') {
            if (!isRoot) {
              this.warn(`Overlay "${dest.name}" is not a selected frame and was ignored`);
              continue;
            }
            attrs['data-open'] = this.domId(dest, 'overlay-');
            this.features.add('overlay');
            interactive = true;
          } else if (a.navigation === 'SCROLL_TO') {
            attrs['data-scroll'] = this.domId(dest);
            this.features.add('scroll');
            interactive = true;
          }
        }
      }
    }
    if (interactive && !['button', 'a'].includes(sem.tag)) {
      attrs.role = 'button';
      attrs.tabindex = '0';
    }
    return attrs;
  }

  // ---------------------------------------------------------------- styles
  addRule(selector: string, decls: Styles, media?: string) {
    this.rules.push({ selector, decls, media });
  }

  relPos(n: SerializedNode, parent: SerializedNode) {
    return parent.type === 'GROUP'
      ? { x: n.absoluteX - parent.bounds.x, y: n.absoluteY - parent.bounds.y }
      : { x: n.x, y: n.y };
  }

  placement(n: SerializedNode, parent: SerializedNode): Styles {
    const rel = this.relPos(n, parent);
    if (this.opts.layout === 'pixel')
      return { ...absoluteStyles(n, rel.x, rel.y), ...rotationStyles(n) };
    if (isAutoLayout(parent) && n.layoutPositioning !== 'ABSOLUTE')
      return { ...flexChildStyles(n, parent), ...rotationStyles(n) };
    const c = constraintStyles(n, parent, rel.x, rel.y);
    return { ...c, ...rotationStyles(n, c.transform) };
  }

  rootPlacement(n: SerializedNode): Styles {
    const s: Styles = { position: 'relative', margin: '0 auto' };
    if (this.opts.layout === 'pixel') {
      s.width = px(n.width);
      s.height = px(n.height);
    } else {
      s.width = '100%';
      s['max-width'] = px(n.width);
      if (isAutoLayout(n) && n.layoutSizingVertical === 'HUG') s['min-height'] = '0';
      else if (isAutoLayout(n)) s['min-height'] = px(n.height);
      else s.height = px(n.height);
    }
    return s;
  }

  boxStyles(n: SerializedNode, isImg: boolean): Styles {
    const s: Styles = {};
    if (n.type === 'TEXT') return s;
    if (!isImg) Object.assign(s, backgroundStyles(n, this.env));
    const stroke = strokeStyles(n, this.env);
    Object.assign(s, stroke.styles);
    const radius = n.type === 'ELLIPSE' ? '50%' : radiusCss(n);
    if (radius) s['border-radius'] = radius;
    Object.assign(s, effectStyles(n, false, this.env, stroke.outsideShadow));
    if (n.clipsContent) s.overflow = 'hidden';
    Object.assign(s, visualStyles(n));
    if (this.opts.layout === 'responsive') Object.assign(s, autoLayoutToFlex(n));
    // getCSSAsync output is used only for properties we did not generate ourselves
    if (n.css) {
      for (const k of ['mix-blend-mode', 'backdrop-filter', 'filter'])
        if (n.css[k] && !s[k]) s[k] = n.css[k];
    }
    return s;
  }

  // ---------------------------------------------------------------- markup
  attrString(a: Record<string, string | undefined>): string {
    return Object.entries(a)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escapeHtml(v as string)}"`))
      .join('');
  }

  buildRoot(root: SerializedNode, tag: string, extra: Record<string, string | undefined>): string {
    const container = CONTAINER_TYPES.includes(root.type) && !root.svg;
    if (!container) {
      // single leaf selected: wrap it in a sized root box
      const cls = this.className(root) + '-root';
      this.addRule(`.${cls}`, this.rootPlacement(root));
      const ghost: SerializedNode = {
        ...root,
        x: 0,
        y: 0,
        absoluteX: root.bounds.x,
        absoluteY: root.bounds.y,
      };
      const inner = this.build(ghost, root, null, 1);
      return `<${tag}${this.attrString({ class: `frame ${cls}`, ...extra })}>${inner}\n</${tag}>`;
    }
    return this.build(root, null, null, 0, tag, extra);
  }

  build(
    n: SerializedNode,
    parent: SerializedNode | null,
    parentSem: Sem | null,
    depth: number,
    rootTag?: string,
    extra: Record<string, string | undefined> = {},
    roleHint?: string,
  ): string {
    this.nodeCount++;
    const ind = '\n' + '  '.repeat(depth + 1);
    const sem = rootTag
      ? { ...this.infer(n, null, null), tag: rootTag }
      : this.infer(n, parent, parentSem);
    const cls = this.className(n);
    const isRoot = !parent;
    const decls: Styles = {};
    const attrs: Record<string, string | undefined> = {
      class: isRoot ? `frame ${cls}` : cls,
      ...extra,
    };
    if (!n.visible) attrs.hidden = '';
    if (this.scrollTargets.has(n.id) && !isRoot) attrs.id = this.domId(n);
    if (roleHint) attrs['data-role'] = roleHint;
    Object.assign(attrs, this.interactionAttrs(n, sem));
    const placeStyles = isRoot
      ? this.rootPlacement(n)
      : this.placement(n, parent as SerializedNode);

    // ---- text
    if (n.type === 'TEXT') {
      this.textCount++;
      Object.assign(
        decls,
        placeStyles,
        textStyles(n, this.env),
        effectStyles(n, true, this.env),
        visualStyles(n),
      );
      if (n.hasMissingFont)
        this.warn(`Font "${n.fontFamily}" was missing in Figma; check text in "${n.name}"`);
      this.addRule(`.${cls}`, decls);
      let inner: string;
      if (n.textSegments && n.textSegments.length > 1) {
        inner = n.textSegments
          .map((seg, i) => {
            const sd = segmentStyles(seg, n);
            if (!Object.keys(sd).length) return escapeHtml(seg.characters);
            const sc = `${cls}-s${i + 1}`;
            this.usedClass.add(sc);
            this.addRule(`.${sc}`, sd);
            return `<span class="${sc}">${escapeHtml(seg.characters)}</span>`;
          })
          .join('');
      } else inner = escapeHtml(n.characters ?? '');
      const tag = sem.tag;
      return `${depth ? ind : ''}<${tag}${this.attrString(attrs)}>${inner}</${tag}>`;
    }

    // ---- inline svg
    if (n.svg) {
      Object.assign(decls, placeStyles, visualStyles(n));
      this.addRule(`.${cls}`, decls);
      this.rasterized += 0;
      let svg = sanitizeSvgIds(n.svg, this.svgIds).replace(/<\?xml[^>]*\?>\s*/g, '');
      const attrStr = this.attrString({ ...attrs, 'aria-hidden': 'true', focusable: 'false' });
      svg = svg.replace(/<svg\b/, `<svg${attrStr}`);
      return `${depth ? ind : ''}${svg}`;
    }

    // ---- image
    if (sem.isImg) {
      const fill = visibleFills(n)[0];
      const src = this.imageUrl(fill.imageHash as string);
      Object.assign(decls, placeStyles, this.boxStyles(n, true));
      decls['object-fit'] = fill.scaleMode === 'FIT' ? 'contain' : 'cover';
      if (!src) {
        this.warn(`Image in "${n.name}" could not be read`);
        decls.background = '#e5e5e5';
        this.addRule(`.${cls}`, decls);
        return `${depth ? ind : ''}<div${this.attrString(attrs)}></div>`;
      }
      const alt = this.opts.altOverrides[n.id] ?? (humanize(n.name) || 'Image');
      this.images.push({ nodeId: n.id, name: n.name, alt });
      this.addRule(`.${cls}`, decls);
      return `${depth ? ind : ''}<img${this.attrString({ ...attrs, src, alt })}>`;
    }

    // ---- input
    if (sem.tag === 'input') {
      const textChild = this.firstText(n);
      Object.assign(decls, placeStyles, this.boxStyles(n, false));
      delete decls.display;
      delete decls['flex-direction'];
      delete decls['justify-content'];
      delete decls['align-items'];
      if (textChild) {
        Object.assign(
          decls,
          typographyStyles({
            fontFamily: textChild.fontFamily,
            fontSize: textChild.fontSize,
            fontWeight: textChild.fontWeight,
            italic: textChild.italic,
            lineHeight: undefined,
            color: visibleFills(textChild)[0]?.color,
          }),
        );
        decls.padding = `0 ${px(Math.max(0, textChild.x))}`;
      }
      this.addRule(`.${cls}`, decls);
      return `${depth ? ind : ''}<input${this.attrString({ ...attrs, type: sem.inputType, placeholder: textChild?.characters, 'aria-label': humanize(n.name) || 'Input' })}>`;
    }

    // ---- containers
    Object.assign(decls, placeStyles, this.boxStyles(n, false));
    if (n.children?.length && !decls.position) decls.position = 'relative';
    if (n.children?.length && decls.position === 'absolute' && this.opts.layout === 'pixel')
      decls.position = 'absolute';
    this.addRule(`.${cls}`, decls);

    if (
      this.opts.layout === 'responsive' &&
      n.layoutMode === 'HORIZONTAL' &&
      n.width > 600 &&
      (n.children?.length ?? 0) >= 2 &&
      (n.children ?? []).every((c) => c.width > 120)
    )
      this.mobileRows.push(cls);

    if (sem.component) this.markComponent(n, sem, attrs);
    if (sem.tag === 'button' && /submit/.test(hayOf(n))) attrs.type = 'submit';
    else if (sem.tag === 'button') attrs.type = 'button';
    if (sem.tag === 'a' && !attrs.href) attrs.href = '#';
    if (sem.tag === 'button' && !this.hasText(n))
      attrs['aria-label'] = humanize(n.name) || 'Button';
    if (/(hamburger|burger|menu.*(toggle|button|icon|btn))/.test(hayOf(n)) && !sem.component) {
      attrs['data-role'] = 'menu-toggle';
      this.features.add('menu');
      if (!['button', 'a'].includes(sem.tag)) {
        attrs.role = 'button';
        attrs.tabindex = '0';
      }
    } else if (
      /(^|[\s/_.-])(mobile[\s/_.-]*)?(menu|drawer|sidebar)([\s/_.-]|$)/.test(hayOf(n)) &&
      n.children?.length &&
      !roleHint
    ) {
      attrs['data-role'] = 'menu-panel';
    }
    if (
      /(^|[\s/_.-])(close|dismiss)([\s/_.-]|$)/.test(hayOf(n)) &&
      this.componentStack.includes('modal') &&
      !attrs['data-close']
    ) {
      attrs['data-close'] = '';
      this.features.add('overlay');
      if (!['button', 'a'].includes(sem.tag)) {
        attrs.role = 'button';
        attrs.tabindex = '0';
      }
    }
    if (/open.*(modal|dialog)/.test(hayOf(n)) && this.modalIds.length === 0)
      this.pendingOpeners.push(attrs);
    if (sem.component) this.componentStack.push(sem.component);

    const kids = (n.children ?? []).filter((c) => !c.isMask && (c.visible || this.includeHidden));
    let inner = '';
    kids.forEach((c, i) => {
      let hint: string | undefined;
      if (sem.component === 'accordion') hint = 'accordion-item';
      else if (parentSem?.component === 'accordion' || attrs['data-role'] === 'accordion-item')
        hint = i === 0 ? 'accordion-header' : 'accordion-content';
      else if (sem.component === 'dropdown')
        hint = i === 0 ? 'dropdown-trigger' : i === 1 ? 'dropdown-menu' : undefined;
      else if (this.componentStack.includes('tabs') && /(^|[\s/_.-])tab([\s/_.-]|$)/.test(hayOf(c)))
        hint = 'tab';
      else if (this.componentStack.includes('tabs') && /panel|tab content|content/.test(hayOf(c)))
        hint = 'panel';
      inner += this.build(c, n, sem, depth + 1, undefined, {}, hint);
    });
    if (sem.component) this.componentStack.pop();
    if (attrs['data-role'] === 'accordion-header') {
      this.features.add('accordion');
      attrs['aria-expanded'] = 'true';
    }

    const tag = sem.tag;
    const pad = inner ? ind.slice(0, -2) : '';
    if (sem.wrapNav) {
      const navCls = `${cls}-nav`;
      this.usedClass.add(navCls);
      this.addRule(`.${navCls}`, { display: 'contents' });
      return `${depth ? ind : ''}<header${this.attrString(attrs)}><nav class="${navCls}" aria-label="${escapeHtml(humanize(n.name) || 'Main')}">${inner}${pad}</nav></header>`;
    }
    return `${depth ? ind : ''}<${tag}${this.attrString(attrs)}>${inner}${pad}</${tag}>`;
  }

  pendingOpeners: Array<Record<string, string | undefined>> = [];

  markComponent(n: SerializedNode, sem: Sem, attrs: Record<string, string | undefined>) {
    attrs['data-component'] = sem.component;
    if (sem.component === 'tabs') this.features.add('tabs');
    if (sem.component === 'accordion') this.features.add('accordion');
    if (sem.component === 'dropdown') this.features.add('dropdown');
    if (sem.component === 'form') this.features.add('form');
    if (sem.component === 'modal') {
      attrs.role = 'dialog';
      attrs['aria-modal'] = 'true';
      attrs.id = this.domId(n, 'modal-');
      this.modalIds.push(attrs.id);
      this.features.add('overlay');
      for (const o of this.pendingOpeners) {
        o['data-open'] = attrs.id;
        o.role ??= 'button';
        o.tabindex ??= '0';
      }
    }
  }

  firstText(n: SerializedNode): SerializedNode | undefined {
    if (n.type === 'TEXT') return n;
    for (const c of n.children ?? []) {
      const t = this.firstText(c);
      if (t) return t;
    }
    return undefined;
  }

  hasText(n: SerializedNode): boolean {
    return !!this.firstText(n);
  }
}

export function generateHtml(
  doc: SerializedDocument,
  options: HtmlGenerateOptions,
  includeHidden: boolean,
): HtmlResult {
  const b = new Builder(doc, options, includeHidden);
  const roots = doc.roots.filter((r) => r.visible || includeHidden);
  const overlayRoots = roots.filter((r) => b.overlayTargets.has(r.id));
  const pageRoots = roots.filter((r) => !b.overlayTargets.has(r.id));
  const pageMode = options.interactions && pageRoots.length > 1 && b.navTargets.size > 0;
  const startId = doc.flowStartIds.find((id) => pageRoots.some((r) => r.id === id));
  const initial = pageRoots.find((r) => r.id === startId) ?? pageRoots[0];
  if (pageMode) pageRoots.forEach((r) => b.domId(r, 'frame-'));
  overlayRoots.forEach((r) => b.domId(r, 'overlay-'));

  const single = pageRoots.length === 1;
  let body = '';
  pageRoots.forEach((r, i) => {
    const extra: Record<string, string | undefined> = {};
    if (pageMode) {
      extra.id = b.domId(r, 'frame-');
      extra['data-frame'] = '';
      if (r !== initial) extra.hidden = '';
    }
    void i;
    body += '\n  ' + b.buildRoot(r, single ? 'main' : 'section', extra);
  });
  if (!single) body = `\n<main>${body.replace(/\n/g, '\n  ')}\n</main>`;
  let overlays = '';
  for (const r of overlayRoots) {
    const id = b.domId(r, 'overlay-');
    const inner = b.buildRoot(r, 'section', {});
    overlays += `\n<div class="overlay" id="${id}" role="dialog" aria-modal="true" aria-label="${escapeHtml(humanize(r.name))}" hidden>\n  ${inner}\n</div>`;
  }
  if (overlays) b.features.add('overlay');

  // responsive helpers
  if (options.layout === 'responsive') {
    if (b.mobileRows.length) {
      const sel = b.mobileRows.map((c) => `.${c}`);
      b.addRule(sel.join(','), { 'flex-wrap': 'wrap' }, '(max-width: 768px)');
      b.addRule(
        sel.join(','),
        { 'flex-direction': 'column', 'align-items': 'stretch' },
        '(max-width: 480px)',
      );
      b.addRule(
        sel.map((s) => `${s}>*`).join(','),
        { width: '100%', 'max-width': '100%' },
        '(max-width: 480px)',
      );
    }
    b.addRule('img,svg', { 'max-width': '100%' }, '(max-width: 480px)');
  }
  if (!pageMode && pageRoots.length > 1) b.addRule('.frame+.frame', { 'margin-top': '40px' });

  const { vars, rules } = extractVariables(b.rules);
  const css = rulesToCss(rules, vars);
  const js = options.interactions
    ? generateJavaScript({
        features: b.features,
        pageMode,
        initialFrameId: pageMode ? b.domId(initial, 'frame-') : null,
      })
    : '';
  const title = escapeHtml(roots[0]?.name ?? 'Export');
  const head = (style: string) =>
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>${title}</title>\n${style}\n</head>\n<body>`;
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const markup = `${body}${overlays}`;
  const html = `${head(`<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)}${markup}\n${safeJs ? `<script>\n${safeJs}\n</script>\n` : ''}</body>\n</html>\n`;
  const indexHtml = `${head('<link rel="stylesheet" href="styles.css" />')}${markup}\n${js ? '<script src="script.js"></script>\n' : ''}</body>\n</html>\n`;
  return {
    html,
    css,
    js,
    indexHtml,
    assets: Array.from(b.assets.values()),
    images: b.images,
    warnings: b.warnings,
    nodeCount: b.nodeCount,
    textCount: b.textCount,
    rasterized: b.rasterized,
  };
}

export async function exportHtml(
  doc: SerializedDocument,
  opts: HtmlOptions,
  includeHidden: boolean,
  altOverrides: Record<string, string>,
  ctx: ExportContext,
): Promise<ExportOutput & { result: HtmlResult }> {
  const started = performance.now();
  ctx.progress('Building document', 20);
  const result = generateHtml(
    doc,
    { ...opts, assetMode: opts.zipProject ? 'files' : 'inline', altOverrides },
    includeHidden,
  );
  result.warnings.forEach((w) => ctx.warn(w));
  ctx.token.throwIfCancelled();
  const base = sanitizeFileName(doc.roots.length === 1 ? doc.roots[0].name : doc.pageName, 'index');
  let files: ExportFile[];
  if (opts.zipProject) {
    files = [
      { name: 'index.html', data: result.indexHtml, mime: 'text/html' },
      { name: 'styles.css', data: result.css, mime: 'text/css' },
      ...(result.js ? [{ name: 'script.js', data: result.js, mime: 'text/javascript' }] : []),
      ...result.assets.map((a) => ({ name: a.name, data: a.bytes, mime: a.mime })),
    ];
    files = await packageFiles(files, true, `${base}-html`, ctx);
  } else files = [{ name: `${base}.html`, data: result.html, mime: 'text/html' }];
  const report: ConversionReport = {
    format: 'HTML',
    frames: doc.roots.length,
    layersProcessed: result.nodeCount,
    layersPreserved: result.nodeCount - result.rasterized,
    layersRasterized: result.rasterized,
    textLayersPreserved: result.textCount,
    imagesEmbedded: Object.keys(doc.images).length,
    unsupportedEffects: doc.stats.unsupportedEffects,
    durationMs: Math.round(performance.now() - started),
    outputBytes: totalBytes(files),
    files: files.map((f) => f.name),
    warnings: result.warnings,
    errors: [],
  };
  void utf8;
  return { files, report, result };
}
