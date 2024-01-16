import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { marked } from 'marked'
import { imageSize } from 'image-size'
import { URL, CSS, BASE_URL, BODY, CSS_PATH, DESCRIPTION, HEADER, INDEX, INDEX_PAGE_DESCRIPTION,
  INDEX_PAGE_HEADER, INDEX_PAGE_TITLE, SEPARATOR, SOURCE_DIR, TITLE, MD_TO_HTML } from './const.js'

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window as unknown as Window)
const httpsRe = /(^https:\/\/)|(^http:\/\/)/
const mdRe = /(\.md$)|(\.md#)/

export function createHash(text: string) {
  const document = new window.DOMParser().parseFromString(text, 'text/html')
  return document.body.textContent!
    .replaceAll(/(\s|\?|:|&|=|%|"|'|\/|@)/g, '_')
    .replaceAll(/</g, '-_')
    .replaceAll(/>/g, '_-')
}

export async function createPageData(markDownFileName: string): Promise<Page> {
  const content = await readFile(markDownFileName, 'utf8')
  const [meta, md] = getMetaAndMd(content)
  const title = createTitle(md)
  const { name, dir } = path.parse(markDownFileName)
  const url = createURL(dir, name)
  const page = {
    meta,
    title,
    url
  }
  return page
}

export async function createPages(markDownFileNames: string[]) {
  const createPageDataPromises = markDownFileNames.map(
    (markDownFileName) => createPageData(markDownFileName))
  return await Promise.all(createPageDataPromises)
}

const renderer = {
  link(href: string, title: string | null | undefined, text: string) {
    if (MD_TO_HTML && !href.match(httpsRe) && href.match(mdRe)) {
      const _href = `${BASE_URL}/${href.replace('.md', '.html')}`
      return `<a href="${_href}" class="Link">${text}</a>`
    }
    return `<a href="${href}" class="Link">${text}</a>`
  },
  heading(text: string, level: number) {
    const hash = createHash(text)
    return `<h${level} id="${hash}"><a href="#${hash}" class="anchor">#</a>${text}</h${level}>\n`
  },
  image(src: string) {
    const alt = src.split('/').at(-1)
    const url = `${BASE_URL}/${src}`
    try {
      const { height, width } = imageSize(`${SOURCE_DIR}/${src}`)
      return `<img alt="${alt}" src="${url}" width="${width}" height="${height}" loading="lazy">`
    }
    catch(e) {
      console.warn(e)
      return `<img alt="${alt}" src="${url}" loading="lazy">`
    }
  }
}

marked.use({
  renderer
})

interface Meta {
  header: {
    name: string
    order: number
  }
  order: number
  date?: string
}

export interface Page {
  meta: Meta
  title: string
  url: string
}

interface IndexItem {
  name: string
  pages: Pick<Page, 'title' | 'url'>[]
}

export function createTitle(md: string) {
  return md.slice('# '.length, md.indexOf('\n'))
}

export function getMarkDownFileNames(): Promise<string[]> {
  return glob(`${SOURCE_DIR}/**/*.md`).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

export function getMetaAndMd(content: string): [meta: Meta, md: string] {
  const [meta, md] = content.split(SEPARATOR)
  return [JSON.parse(meta), md.trim()]
}

export function createDescription(html: string) {
  const _html = html.slice(html.indexOf('\n'))
  const document = new window.DOMParser().parseFromString(_html, 'text/html')
  return document.body.textContent!.replaceAll(/\n/g, '').replaceAll(/"/g, '&quot;').slice(0, 300)
}

export function createURL(dir: string, name: string) {
  const prefixDirCount = SOURCE_DIR.length + 1
  if (dir.length <= prefixDirCount) {
    return `${BASE_URL}/${name}.html`
  }
  return `${BASE_URL}/${dir.slice(prefixDirCount)}/${name}.html`
}

export function createHTML(
  layout: string, title: string, body: string, description: string, url: string,
  cssPath: string, indexMenu: string, headerList: string) {
  const html = layout
    .replaceAll(TITLE, () => DOMPurify.sanitize(title))
    .replaceAll(DESCRIPTION, () => DOMPurify.sanitize(description))
    .replace(URL, () => DOMPurify.sanitize(url))
    .replace(CSS, () => DOMPurify.sanitize(cssPath))
    .replace(INDEX, () => DOMPurify.sanitize(indexMenu))
    .replace(HEADER, () => DOMPurify.sanitize(headerList))
    .replace(BODY, () => DOMPurify.sanitize(body))
  return html
}

export async function createPage(
  layout: string, md: string, title: string, url: string, indexMenu: string, headerList: string) {
  const body = await marked.parse(md)
  const description = createDescription(body)
  return createHTML(layout, title, body, description, url, CSS_PATH, indexMenu, headerList)
}

export function createIndexItems(pages: Page[]) {
  return pages.reduce((p, _p) => {
    const { order, name } = _p.meta.header
    const { title, url } = _p
    p[order] ??= {
      name,
      pages: []
    }
    if (p[order].name !== name) {
      console.log(p, _p)
      throw Error('header already exists.')
    }
    const page = p[order].pages[_p.meta.order]
    if (page) {
      console.log(page, _p)
      throw Error('page already exists.')
    }
    p[order].pages[_p.meta.order] = {
      title,
      url
    }
    return p
  }, [] as IndexItem[])
}

export function createIndexMenu(items: IndexItem[]) {
  return `
    <nav class="index-menu">${items.reduce((p, item) => `${p}
      <details open>
        <summary>${item.name}</summary>${item.pages.reduce((p, page) => `${p}
        <p><a href="${page.url}">${page.title}</a></p>`, '')}
      </details>`, '')}
    </nav>`
}

function isHeader(line: string) {
  return [2, 3, 4, 5].some((maxCharacter) => line.slice(0, maxCharacter) === `${'#'.repeat(maxCharacter - 1)} `)
}

export function createHeaderList(md: string) {
  const list = md
    .split('\n')
    .filter(line => isHeader(line))
    .map((line) => {
      for (let i = 2; i <= 5; i++ ) {
        if (line.slice(0, i) === `${'#'.repeat(i - 1)} `) {
          const _header = line.slice(i).trim()
          const header =  (marked.parse(_header) as string).trim()
          const href = createHash(header)
          const document = new window.DOMParser().parseFromString(header, 'text/html')
          return `<p class="h${i - 1}"><a href="#${href}">${document.body.textContent}</a></p>`
        }
      }
    })
    .join('\n')
  return `<nav class="header-list">${list}</nav>`
}

export function createIndexPage(layout: string, indexItems: IndexItem[]) {
  const md = indexItems.reduce((md: string, p) => {
    return `${md}\n## ${p.name}\n${p.pages.map(p => `* [${p.title}](${p.url})`).join('\n')}`
  }, `# ${INDEX_PAGE_HEADER}\n`)
  const body = marked.parse(md) as string
  return createHTML(layout, INDEX_PAGE_TITLE, body, INDEX_PAGE_DESCRIPTION, BASE_URL, CSS_PATH, '', '')
}