---
name: "mobile-responsive-optimizer"
description: "Optimizes web applications for mobile display while preserving desktop layout. Invoke when user needs mobile responsiveness, mobile UI optimization, responsive design fixes, or mobile-specific layout adjustments without breaking desktop experience."
---

# Mobile Responsive Optimizer

This skill specializes in optimizing web applications for mobile devices while maintaining the existing desktop layout and styles intact.

## When to Use This Skill

- User requests mobile display optimization
- Need to fix mobile-specific layout issues (misalignment, overflow, spacing)
- Optimize touch targets and interaction areas for mobile
- Adjust font sizes, spacing, and dimensions for smaller screens
- Restructure content layout for mobile without changing desktop version
- Fix vertical/horizontal alignment issues on mobile devices
- Optimize table or list displays for mobile viewports
- User mentions "手机端", "移动端", "responsive", "mobile optimization"

## Core Optimization Strategies

### 1. Progressive Enhancement Approach

**Principle**: Always preserve desktop layout; only add mobile-specific overrides using media queries.

```css
/* Desktop styles remain unchanged */
.component {
  padding: 13px 16px;
  margin: 0 10px 2px;
  min-height: 64px;
}

/* Mobile-only optimizations */
@media screen and (max-width: 768px) {
  .component {
    padding: 6px 10px !important;
    margin: 0 6px 2px !important;
    height: 48px !important;
    min-height: auto !important;
  }
}
```

### 2. Responsive Typography with clamp()

Use `clamp()` for automatic font size adjustment based on viewport width:

```css
.text-element {
  font-size: clamp(9px, 2vw, 12px) !important;
  line-height: 1 !important;
}

.title-text {
  font-size: clamp(12px, 3vw, 16px) !important;
  font-weight: 600;
}
```

**Benefits**: Eliminates the need for multiple breakpoint-based font size rules.

### 3. Flexible Layout with Flexbox

#### Horizontal to Vertical Transformation

Convert horizontal layouts to vertical stacks on mobile:

```css
/* Desktop: horizontal layout */
.info-container {
  display: flex;
  gap: 20px;
  align-items: center;
}

@media screen and (max-width: 768px) {
  .info-container {
    flex-direction: column !important;
    gap: 2px !important;
    align-items: flex-start !important;
  }
}
```

#### List Item Optimization

```css
.list-item {
  display: flex;
  align-items: center;
  padding: 13px 16px;
  margin: 0 10px 2px;
  cursor: pointer;
}

@media screen and (max-width: 768px) {
  .list-item {
    padding: 6px 10px !important;
    margin: 0 6px 2px !important;
    border-radius: var(--radius-md) !important;
    gap: 4px !important;
    align-items: center !important;
    line-height: 1.2 !important;
    height: 48px !important;
    min-height: auto !important;
  }
  
  /* Left info area */
  .list-item > div[data-col="name"] {
    flex: 2.2 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    justify-content: center !important;
  }
  
  /* Data columns - unified vertical centering */
  .list-item > div[data-col="data"],
  .list-item > div[data-col="value"] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: flex-end !important;
    gap: 0 !important;
  }
}
```

### 4. Text Truncation and Overflow Handling

```css
.truncatable-text {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  display: inline-flex !important;
  align-items: center !important;
}

/* For multi-line truncation */
.multi-line-truncate {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
```

### 5. Touch Target Optimization

Ensure all interactive elements meet minimum touch target size (48x48px per WCAG 2.1 AA):

```css
.interactive-element {
  min-height: 48px;
  min-width: 48px;
  padding: 12px;
}

/* For compact layouts where 48px isn't feasible */
.compact-touch-target {
  position: relative;
}

.compact-touch-target::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  right: -50%;
  bottom: -50%;
}
```

### 6. Spacing and Dimension Adjustments

#### Compact Spacing for Mobile

```css
/* Reduce gaps between items */
.item-container {
  gap: 8px;
}

@media screen and (max-width: 768px) {
  .item-container {
    gap: 2px !important;
    margin-bottom: 4px !important;
  }
}

/* Internal element spacing */
.element-spacing {
  padding: 16px;
  margin-bottom: 12px;
}

@media screen and (max-width: 768px) {
  .element-spacing {
    padding: 6px 10px !important;
    margin-bottom: 2px !important;
  }
}
```

### 7. Vertical Alignment Techniques

Fix common vertical misalignment issues:

```css
/* Ensure perfect centering */
.centered-container {
  display: flex;
  flex-direction: column;
  justify-content: center; /* Vertical centering */
  align-items: center;     /* Horizontal centering */
}

/* Cross-axis alignment in row layout */
.row-container {
  display: flex;
  align-items: center;      /* Vertical centering for items */
  gap: 10px;
}

/* Baseline alignment for text-heavy content */
.text-row {
  display: flex;
  align-items: baseline;    /* Align text baselines */
  gap: 20px;
}
```

## Implementation Workflow

### Step 1: Assessment

Before making changes, identify:
1. Current layout structure (Flexbox, Grid, block)
2. Elements that need repositioning for mobile
3. Fixed vs flexible dimensions
4. Touch interaction requirements
5. Content priority (what to show/hide)

### Step 2: Media Query Setup

Establish consistent breakpoints:

```css
/* Common breakpoints */
@media screen and (max-width: 480px)  { /* Small phones */ }
@media screen and (max-width: 768px)  { /* Tablets and large phones */ }
@media screen and (max-width: 1024px) { /* Small laptops */ }
```

**Recommendation**: Use `768px` as primary mobile breakpoint for most cases.

### Step 3: Apply Optimizations

Follow this order for optimal results:

1. **Layout restructuring** (flex-direction, grid-template)
2. **Dimension adjustments** (padding, margin, height, width)
3. **Typography scaling** (font-size with clamp())
4. **Spacing refinement** (gap, margins between elements)
5. **Content visibility** (hide/show elements based on viewport)
6. **Alignment fixes** (vertical/horizontal centering)
7. **Touch target validation** (ensure 48x48px minimum)

### Step 4: Testing Checklist

Verify these aspects after implementation:

- [ ] Desktop layout remains unchanged
- [ ] No horizontal scrolling on mobile
- [ ] Text is readable without zooming
- [ ] Touch targets are easily tappable
- [ ] No content overflow or clipping
- [ ] Consistent spacing between elements
- [ ] Proper vertical alignment of data
- [ ] Smooth transitions between breakpoints
- [ ] Performance is acceptable (no jank)

## Common Patterns and Solutions

### Pattern 1: Table-to-Card Conversion

Transform tabular data into card layout for mobile:

```css
/* Desktop table */
.data-table {
  display: table;
  width: 100%;
}

.table-row {
  display: table-row;
}

.table-cell {
  display: table-cell;
  padding: 12px;
}

/* Mobile card layout */
@media screen and (max-width: 768px) {
  .table-row {
    display: flex !important;
    flex-direction: column !important;
    padding: 10px !important;
    margin-bottom: 8px !important;
    background: var(--bg-card);
    border-radius: 8px;
  }
  
  .table-cell {
    display: flex !important;
    justify-content: space-between !important;
    padding: 4px 0 !important;
  }
  
  /* Hide header cells if needed */
  .table-header {
    display: none !important;
  }
}
```

### Pattern 2: Summary Card Responsive Layout

```css
.summary-card {
  display: flex;
  gap: 20px;
  align-items: baseline;
}

@media screen and (max-width: 768px) {
  .summary-card {
    flex-direction: column !important;
    gap: 8px !important;
    align-items: flex-start !important;
  }
  
  .summary-item {
    width: 100% !important;
  }
}
```

### Pattern 3: Status Tag Positioning

Move status indicators based on available space:

```css
.item-with-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

@media screen and (max-width: 768px) {
  .item-with-status {
    flex-wrap: wrap !important;
  }
  
  /* Move status tag to next line or after specific element */
  .status-tag {
    order: 2 !important;      /* Reposition within flex container */
    font-size: clamp(9px, 1.5vw, 11px) !important;
  }
}
```

### Pattern 4: Hiding Non-Essential Elements

```css
/* Hide fund codes, type tags, etc. on mobile */
.hide-on-mobile {
  display: block;
}

@media screen and (max-width: 768px) {
  .hide-on-mobile {
    display: none !important;
  }
  
  /* Alternative: hide via container query when space is limited */
  .conditional-hide:has(> .limited-space) {
    display: none;
  }
}
```

## Performance Considerations

### 1. CSS Specificity Management

Use `!important` sparingly and only in media queries to override desktop styles:

```css
/* Good: scoped override */
@media (max-width: 768px) {
  .component {
    property: value !important;
  }
}

/* Bad: global !important */
.component {
  property: value !important; /* Avoid outside media queries */
}
```

### 2. Efficient Selectors

Prefer class selectors over complex descendant chains:

```css
/* Better performance */
.mobile-optimized { ... }

/* Avoid overly specific selectors */
div.container > div.wrapper > div.content > span.text { ... }
```

### 3. Minimize Reflows

Group style changes to minimize layout recalculations:

```css
/* Batch related properties */
@media screen and (max-width: 768px) {
  .element {
    /* Layout */
    display: flex;
    flex-direction: column;
    
    /* Box model */
    padding: 10px;
    margin: 5px 0;
    
    /* Visual */
    font-size: 14px;
    line-height: 1.4;
  }
}
```

## Debugging Tools and Techniques

### Chrome DevTools Mobile Simulation

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select device or set custom dimensions
4. Test touch events and network throttling

### Lighthouse Audit

Run Lighthouse to check:
- Mobile-friendly test
- Performance metrics
- Accessibility (touch targets, contrast)
- Best practices

### Common Issues and Fixes

#### Issue: Height not changing despite styles

**Cause**: Global CSS rule with higher specificity or `!important`
**Solution**: 
```css
/* Find conflicting rule and override it */
.global-rule {
  min-height: 64px !important; /* Conflicting rule */
}

@media screen and (max-width: 768px) {
  .target-element {
    min-height: auto !important; /* Override with equal specificity */
    height: 48px !important;
  }
}
```

#### Issue: Elements not vertically centered

**Cause**: Missing `justify-content` or `align-items` properties
**Solution**:
```css
.container {
  display: flex;
  flex-direction: column;
  justify-content: center; /* Add this */
  align-items: center;     /* And this */
}
```

#### Issue: Text overflowing container

**Cause**: No overflow handling or fixed widths
**Solution**:
```css
.text-container {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
```

#### Issue: Touch targets too small

**Solution**: Increase padding or use pseudo-element expansion (see Section 5)

## Best Practices Summary

1. ✅ **Always use media queries** - Never modify base styles directly
2. ✅ **Preserve desktop layout** - Only add mobile overrides
3. ✅ **Use responsive units** - vw, vh, rem, %, clamp()
4. ✅ **Test on real devices** - Emulators don't catch all issues
5. ✅ **Consider touch interactions** - 48x48px minimum targets
6. ✅ **Optimize performance** - Minimize reflows and repaints
7. ✅ **Maintain accessibility** - Color contrast, focus states, semantic HTML
8. ✅ **Progressive enhancement** - Start with desktop, layer mobile improvements
9. ✅ **Document changes** - Comment media queries clearly
10. ✅ **Test thoroughly** - Multiple devices, orientations, browsers

## Example: Complete Mobile Optimization

Here's a complete example showing before/after for a list component:

### Before (Desktop Only)

```css
.fund-list-item {
  display: flex;
  align-items: center;
  padding: 13px 16px;
  margin: 0 10px 2px;
  background: var(--bg-card);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fund-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.fund-data {
  font-size: 14px;
  font-family: var(--font-mono);
}
```

### After (Mobile Optimized)

```css
/* Base styles unchanged */
.fund-list-item {
  display: flex;
  align-items: center;
  padding: 13px 16px;
  margin: 0 10px 2px;
  background: var(--bg-card);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fund-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.fund-data {
  font-size: 14px;
  font-family: var(--font-mono);
}

/* Mobile optimizations */
@media screen and (max-width: 768px) {
  .fund-list-item {
    padding: 6px 10px !important;
    margin: 0 6px 2px !important;
    border-radius: var(--radius-md) !important;
    gap: 4px !important;
    align-items: center !important;
    line-height: 1.2 !important;
    min-height: auto !important;
    height: 48px !important;
  }
  
  .fund-name {
    font-size: clamp(12px, 2.5vw, 14px) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  
  .fund-data {
    font-size: clamp(9px, 2vw, 12px) !important;
    white-space: nowrap !important;
    line-height: 1 !important;
  }
  
  /* Optimize data columns */
  .fund-list-item > div[data-col] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: flex-end !important;
  }
}
```

## Quick Reference Card

| Aspect | Technique | Code Snippet |
|--------|-----------|--------------|
| Breakpoint | Media Query | `@media (max-width: 768px)` |
| Font Size | clamp() | `font-size: clamp(12px, 2.5vw, 16px)` |
| Layout | Flexbox | `flex-direction: column` |
| Spacing | Reduced values | `gap: 4px`, `padding: 6px` |
| Alignment | Centering | `justify-content: center` |
| Text Overflow | Truncation | `text-overflow: ellipsis` |
| Touch Target | Minimum size | `min-height: 48px` |
| Visibility | Conditional hide | `display: none` in media query |

## Notes

- Always backup code before applying optimizations
- Test on multiple real devices when possible
- Consider network conditions (3G/4G/WiFi) for performance
- Monitor Core Web Vitals after changes
- Keep accessibility in mind (WCAG 2.1 AA compliance)
- Use semantic HTML5 elements for better mobile support
