import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()], base: './',
  resolve: { dedupe: ['@tiptap/core', '@tiptap/pm', 'prosemirror-state', 'prosemirror-view', 'prosemirror-model', 'prosemirror-transform', 'prosemirror-keymap'] },
})
