import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab Manager',
    description:
      'A focused tab workspace with search, smart grouping, batch actions, and history in popup, side panel, and dashboard.',
    minimum_chrome_version: '114',
    permissions: ['favicon', 'sidePanel', 'storage', 'system.memory', 'tabGroups', 'tabs'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    },
    action: {
      default_title: 'Tab Manager',
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
        delete manifest.action.default_popup;
      }
    }
  },
  vite: () => ({
    plugins: [tailwindcss()]
  })
});
