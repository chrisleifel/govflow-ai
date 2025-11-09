# GovFlow AI - Development Rules

## Git & Safety Protocol
1. **ALWAYS create a git branch before adding new features**
2. **NEVER modify index.html without testing in isolation first**
3. **REVERT IMMEDIATELY if navigation or core features break**
4. **Test changes in a separate file before integrating**
5. **Commit working state before attempting major changes**

## Design System - Professional Blue Ocean Aesthetic
**Cutting Edge Design:** Every new feature must use modern, sophisticated blue ocean themed design with depth and professionalism

### Glassmorphism
- **Standard Glass:** `background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(20px); border: 1px solid rgba(6, 182, 212, 0.25);`
- **Dark Glass:** `background: rgba(10, 22, 40, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(6, 182, 212, 0.15);`
- **Glass Shadow:** `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);`

### Color Palette

**Primary Ocean Colors:**
- Deep Ocean: `#0a1628` (darkest backgrounds)
- Ocean Dark: `#0c4a6e` (primary backgrounds, sidebar base)
- Ocean Primary: `#0369a1` (main accent)
- Azure Blue: `#0284c7` (highlights, sidebar gradient)
- Sky Blue: `#0ea5e9` (interactive elements)
- Cyan Bright: `#06b6d4` (buttons, active states, borders)
- Teal Accent: `#14b8a6` (success indicators, positive states)

**Neutral Depths:**
- Navy Deep: `#0f172a` (base backgrounds)
- Slate Dark: `#1e293b` (card backgrounds)
- Slate Medium: `#334155` (borders, dividers)
- Slate Light: `#475569` (secondary borders)

**Accent Colors:**
- Emerald Success: `#10b981` (success states)
- Amber Warning: `#f59e0b` (warnings)
- Rose Danger: `#f43f5e` (errors, alerts)
- Violet Special: `#8b5cf6` (special features)

**Glow Effects:**
- Cyan Glow: `rgba(6, 182, 212, 0.4)` for hover/active glows
- Azure Glow: `rgba(2, 132, 199, 0.5)` for secondary glows

### Gradients

**Background:**
```css
background: linear-gradient(135deg,
    #0a1628 0%,
    #0c2340 25%,
    #0e3a5f 50%,
    #1e3a5f 75%,
    #164e7f 100%
);
```

**Sidebar:**
```css
background: linear-gradient(180deg,
    #0c4a6e 0%,
    #0369a1 50%,
    #0284c7 100%
);
```

**Buttons (Primary):**
```css
background: linear-gradient(90deg, #06b6d4, #0284c7);
```

- **Transitions:** `transition: all 0.3s ease;`
- **Spacing:**
  - Cards: `p-6`
  - Sections: `mb-6`
  - Grids: `gap-6`
- **Typography:**
  - Headers: `font-bold text-white`
  - Body: `text-white/80`
  - Labels: `text-white/70`

## Responsive Design
- **Mobile first approach:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- **Minimum tap target:** 44px for all interactive elements
- **Breakpoints:**
  - Small (sm): 640px
  - Medium (md): 768px
  - Large (lg): 1024px
  - Extra Large (xl): 1280px
- Test all layouts at each breakpoint

## Critical Rules

### 1. PRESERVE EXISTING
- **Never modify or remove existing features**
- Only add new features alongside current code
- Don't break what already works

### 2. GOVERNMENT DATA STANDARDS
- Use **real agency names** (FBI, EPA, IRS - not "Agency A")
- Include compliance badges: **CJIS, FedRAMP, FISMA**
- Realistic metrics (200-500ms response times, not 5ms)
- **ISO 8601 dates** for all date storage
- **Formatted dates** for display to users

### 3. ACCESSIBILITY (A11Y)
- Add `aria-labels` to all interactive elements
- Support **keyboard navigation** (Tab, Enter, Escape)
- **4.5:1 minimum color contrast**
- Screen reader friendly

### 4. ERROR HANDLING
Every feature needs:
- **Loading state** (spinner/skeleton)
- **Empty state** (helpful message)
- **Error state** with retry option

### 5. SECURITY
- **No inline JavaScript** (`onclick` handlers) - Use event delegation instead
- **No localStorage** for sensitive data
- **Validate all user input** before processing
- Mark security TODOs clearly with `// SECURITY TODO:`

### 6. MARK INTEGRATION POINTS
```javascript
// TODO: Connect to API endpoint /api/workflows
// MOCK DATA - Replace in production
// TODO: Add authentication check
```

## Code Standards

### Naming Conventions
- **Functions:** camelCase with verb+noun
  - Examples: `createWorkflow()`, `updateDashboard()`, `deleteContact()`

### Comments & Documentation
- **Mark mock data:** `// MOCK DATA - Replace in production`
- **Mark integration points:** `// TODO: Connect to API endpoint /api/workflows`
- **Add dates to new features:** `// Added 2024-10-05: Workflow builder`
- **Security notes:** `// SECURITY TODO: Validate all user inputs`

### Performance Best Practices
- **Debounce inputs:** 300ms delay for search/filter inputs
- **Pagination:** Max 50 items per page
- **Use CSS animations** over JavaScript when possible
- **Lazy load** heavy components

### Template Structure
Always use:
- Glass effect cards with backdrop-filter
- Grid layouts with proper spacing (gap-6)
- Consistent design system across all features

## Testing Requirements
Every new feature must be verified:
- ✅ Works on desktop (1920x1080)
- ✅ Works on mobile (375x667)
- ✅ Keyboard navigation works
- ✅ No console errors
- ✅ Existing features intact
- ✅ Loading/error/empty states present
- ✅ Mock data clearly marked
- ✅ Integration points documented

## When Building Features - Step-by-Step Process
1. **Build incrementally** - One component at a time
2. **Verify each component** works before adding next layer
3. **Keep existing code working** - Test that nothing breaks
4. **Add all states** - Loading, error, and empty states for every feature
5. **Test on mobile** - Responsive design is non-negotiable
6. **Add comments** for production integration points
7. **Accessible always** - WCAG 2.1 AA minimum
8. **Preserve functionality** - Never break existing features

---

## Quick Checklist for New Features
- [ ] Created git branch?
- [ ] Tested in isolation?
- [ ] Blue ocean design applied?
- [ ] Mobile responsive?
- [ ] Accessibility added?
- [ ] Error handling complete?
- [ ] Mock data marked?
- [ ] No inline JavaScript?
- [ ] All states working (loading/error/empty)?
- [ ] Existing features still work?
