export const EMOJI_MART_MOBILE_FULLSCREEN_SHADOW_CSS = `
:host {
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  --category-icon-size: 28px;
}
:host,
#root.flex.flex-column {
  touch-action: pan-y;
}
#root.flex.flex-column {
  height: 100%;
  min-height: 0;
}
#nav {
  flex-shrink: 0;
  order: 10;
  padding-top: 10px;
  padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--em-color-border);
  background: rgb(var(--em-rgb-background));
}
#nav button {
  min-height: 48px;
}
#nav button svg,
#nav button img {
  width: var(--category-icon-size) !important;
  height: var(--category-icon-size) !important;
}
`;

/** emoji-mart shadow DOM: single scroll surface (`.scroll`) for all categories. */
export const EMOJI_MART_SHADOW_FIX_CSS = `
#root.flex.flex-column {
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
#nav {
  flex-shrink: 0;
}
.scroll.flex-grow {
  min-height: 0;
  height: 0;
  flex: 1 1 0%;
}
.scroll.flex-grow > div {
  height: auto !important;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.scroll.flex-grow > div > div {
  height: auto !important;
}
.category + .category {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--em-color-border);
}
.category .sticky {
  margin-bottom: 6px;
}
.scroll {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: var(--em-color-border) rgb(var(--em-rgb-background));
}
.scroll::-webkit-scrollbar {
  width: 10px;
}
.scroll::-webkit-scrollbar-track {
  background-color: rgba(0, 0, 0, 0.07);
  border-radius: 8px;
}
.scroll::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 3px solid rgb(var(--em-rgb-background));
  border-radius: 8px;
  background-color: var(--em-color-border) !important;
}
.scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--em-color-border-over) !important;
}
`;
