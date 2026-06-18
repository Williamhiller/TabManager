import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  webExt: {
    disabled: true
  },
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    minimum_chrome_version: '114',
    permissions: [
      'bookmarks',
      'alarms',
      'favicon',
      'sidePanel',
      'storage',
      'system.memory',
      'tabGroups',
      'tabs'
    ],
    commands: {
      'toggle-command-palette': {
        suggested_key: {
          default: 'Ctrl+Shift+K'
        },
        description: 'Open command palette'
      }
    },
    optional_permissions: ['webNavigation', 'webRequest'],
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    },
    action: {
      default_title: '__MSG_extActionTitle__',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png'
      }
    },
    options_ui: {
      page: 'dashboard.html',
      open_in_tab: true
    }
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      if (manifest.action) {
        manifest.action.default_title = '__MSG_extActionTitle__';
        delete manifest.action.default_popup;
      }

      manifest.options_ui = {
        page: 'dashboard.html',
        open_in_tab: true
      };
    }
  },
  vite: () => ({
    plugins: [tailwindcss()]
  })
});
