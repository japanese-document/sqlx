export const INDEX_PAGE_LAYOUT = process.env.INDEX_PAGE_LAYOUT || ''
export const OUTPUT_DIR = process.env.OUTPUT_DIR || ''
export const PAGE_LAYOUT = process.env.PAGE_LAYOUT || ''
export const BASE_URL = process.env.BASE_URL || ''
export const CSS_PATH = process.env.CSS_PATH || ''
export const INDEX_PAGE_DESCRIPTION = process.env.INDEX_PAGE_DESCRIPTION || ''
export const INDEX_PAGE_HEADER = process.env.INDEX_PAGE_HEADER || ''
export const INDEX_PAGE_TITLE = process.env.INDEX_PAGE_TITLE ||''
export const SOURCE_DIR = process.env.SOURCE_DIR || ''
export const MD_TO_HTML = process.env.MD_TO_HTML === 'true'
export const SINGLE_PAGE = process.env.SINGLE_PAGE === 'true'
export const TITLE = /__TITLE__/g
export const BODY = '__BODY__'
export const HEADER = '__HEADER__'
export const INDEX = '__INDEX__'
export const CSS = '__CSS__'
export const URL = '__URL__'
export const DESCRIPTION = /__DESCRIPTION__/g
export const SEPARATOR = /---(.*)/s