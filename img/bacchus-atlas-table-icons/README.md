# Bacchus's Atlas — Session Prep table icons

Production-ready SVG icons for the Session Prep table headers.

## Files

- `environments-table.svg` — compass-framed landscape
- `adversaries-table.svg` — horned skull
- `items-table.svg` — potion bottle

## Technical properties

- `24 × 24` SVG viewBox
- Transparent background
- Default antique-gold color: `#D8AD55`
- All visible geometry uses `currentColor`
- Designed to remain readable at `18–24 px`
- No baked-in background, frame, glow, or text

## Recommended implementation

The SVGs have a default gold `color` attribute, so they also work as regular image files:

```html
<img src="/assets/icons/session-prep/environments-table.svg" alt="" width="20" height="20" />
```

For full CSS color control, inline the SVG or import it as a React component, then set `color`:

```css
.session-prep-table-icon {
  width: 20px;
  height: 20px;
  color: var(--gold-400, #d8ad55);
  flex: 0 0 auto;
}

.session-prep-table-header:hover .session-prep-table-icon {
  color: var(--gold-300, #f0c66d);
}
```

Do not add a square background behind these icons. Keep an `8px` visual gap between the icon and the table title.
