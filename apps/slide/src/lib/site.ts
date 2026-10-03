// Site URL baked in at build time (apps/vite.shared.ts); the Slide Guide API lives under <site>/api/slide/.
export const SITE_URL: string = __SITE_URL__
export const api = (path: string) => `${SITE_URL}/api/slide/${path}`
