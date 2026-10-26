import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  const configuredSiteUrl =
    env.VITE_SITE_URL || (vercelHost ? `https://${vercelHost}` : '')
  const siteUrl = configuredSiteUrl.replace(/\/+$/, '')
  const socialImage = siteUrl
    ? `${siteUrl}/hushly-invitation.png`
    : '/hushly-invitation.png'

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'hushly-social-meta',
        transformIndexHtml(html) {
          return html
            .replaceAll('__HUSHLY_SITE_URL__', siteUrl)
            .replaceAll('__HUSHLY_SOCIAL_IMAGE__', socialImage)
            .replace(/<meta property="og:url" content="\/"\s*\/>/, '')
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
