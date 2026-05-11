import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Auto Tab Groups - Tab & Bookmark Manager',
    description:
      'Automatically group Chrome tabs by website, topic, and custom rules. Search, clean up, and manage tabs faster.',
    minimum_chrome_version: '114',
    permissions: [
      'bookmarks',
      'favicon',
      'sidePanel',
      'storage',
      'system.memory',
      'tabGroups',
      'tabs'
    ],
    optional_permissions: ['webNavigation', 'webRequest'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    },
    action: {
      default_title: 'Auto Tab Groups - Tab & Bookmark Manager',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png'
      }
    }
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.action) {
        manifest.action.default_title = 'Auto Tab Groups - Tab & Bookmark Manager';
        delete manifest.action.default_popup;
      }
    }
  },
  vite: () => ({
    plugins: [tailwindcss()]
  })
});
