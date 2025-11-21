# Govli AI Development Rules & Standards

## 🎯 Project Overview

**Project Name**: Govli AI (formerly GovFlow AI)  
**Purpose**: Comprehensive BPM/CRM platform for SLED (State, Local, Education) government organizations  
**Tech Stack**: Node.js/Express, PostgreSQL with PostGIS, React, Docker  
**Deployment**: Frontend on Vercel (govli-ai.vercel.app), Backend on Render (govli-ai.onrender.com)  
**Local Development**: Docker-compose at ~/Govli-AI-v2

---

## 🚨 Git & Safety Protocol

### CRITICAL: Branch Protection Rules
**NEVER commit directly to main branch**

```bash
# ALWAYS create a feature branch first
git checkout -b feature/feature-name

# Work in isolation
# Make changes, test thoroughly
git add .
git commit -m "descriptive message"

# Push to feature branch
git push -u origin feature/feature-name

# Create Pull Request for review
# Only merge after testing and approval
```

### Safety Checklist Before ANY Commit
- [ ] Feature tested in isolation
- [ ] No breaking changes to existing features
- [ ] All existing tests pass
- [ ] New code follows project conventions
- [ ] No console.log statements in production code
- [ ] Sensitive data removed (no hardcoded credentials)
- [ ] Documentation updated if needed

### When Things Break
```bash
# If you accidentally break something:
git stash              # Save your changes
git checkout main      # Go back to working version
git pull               # Get latest stable code
git checkout -b fix/issue-name  # Create fix branch
git stash pop          # Restore your changes
# Fix the issue, test, then commit properly
```

---

## 🏗️ Architecture Standards

### Backend Structure
```
backend/
├── src/
│   ├── routes/          # API route handlers
│   ├── models/          # Database models
│   ├── middleware/      # Auth, logging, validation
│   ├── services/        # Business logic
│   └── utils/           # Helper functions
```

### Frontend Structure
```
frontend/
├── src/
│   ├── pages/           # Main page components
│   ├── components/      # Reusable UI components
│   ├── services/        # API client functions
│   ├── context/         # React context providers
│   └── utils/           # Helper functions
```

### Database Naming Conventions
- Tables: lowercase with underscores (e.g., `security_events`, `workflow_executions`)
- Columns: lowercase with underscores (e.g., `created_at`, `department_id`)
- Foreign keys: `{table}_id` format (e.g., `user_id`, `permit_id`)
- Always include: `id`, `created_at`, `updated_at` columns

---

## 🎨 Design System - Blue Ocean Aesthetic

### Core Philosophy
**Blue Ocean Strategy**: Create uncontested market space through distinctive design that signals innovation while maintaining government credibility.

### Color Palette - Ocean Tech Theme
```css
/* Primary Colors - Ocean Depths */
--primary-blue: #3B82F6;           /* Bright blue for primary actions */
--primary-purple: #8B5CF6;         /* Purple for secondary emphasis */
--ocean-blue: #1E3A8A;             /* Deep blue for headers */
--ocean-teal: #0D9488;             /* Teal for accents */

/* Gradient Backgrounds - Depth Effect */
--gradient-ocean: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
--gradient-blue-purple: linear-gradient(to right, #3B82F6, #8B5CF6);
--gradient-success: linear-gradient(135deg, #10B981 0%, #059669 100%);

/* Status Colors */
--success-green: #10B981;          /* Approvals, completed */
--warning-yellow: #F59E0B;         /* Pending, needs attention */
--error-red: #EF4444;              /* Errors, denied */
--info-blue: #3B82F6;              /* Information, active */

/* Glass Morphism - Signature Look */
--glass-bg: rgba(255, 255, 255, 0.1);
--glass-border: rgba(255, 255, 255, 0.2);
--glass-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
--backdrop-blur: 12px;

/* Background */
--bg-gradient: linear-gradient(135deg, #1a1c2e 0%, #2d3250 100%);
--bg-dark: #0f172a;                /* Dark navy base */

/* Text Colors */
--text-primary: #ffffff;
--text-secondary: rgba(255, 255, 255, 0.8);
--text-muted: rgba(255, 255, 255, 0.6);
```

### Glassmorphism Standards
```css
.glass-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
}

.glass-dark {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.glass-hover {
  transition: all 0.3s ease;
}

.glass-hover:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}
```

### Visual Hierarchy
1. **Headers**: Ocean gradient backgrounds with white text
2. **Cards**: Glass morphism with subtle borders
3. **Buttons**: Gradient fills with hover effects
4. **Icons**: Lucide icons preferred, Font Awesome when needed
5. **Spacing**: 4px, 8px, 16px, 24px, 32px, 48px system

### Component Classes (Reusable)
```javascript
// Card container
<div className="glass-card p-6 rounded-xl">

// Buttons
<button className="btn-primary">Primary Action</button>
<button className="btn-secondary">Secondary Action</button>

// Form inputs
<input className="input-field" type="text" />

// Status badges
<span className="badge badge-success">Active</span>
<span className="badge badge-warning">Pending</span>
<span className="badge badge-error">Failed</span>

// Loading spinner
<div className="spinner"></div>
```

### Responsive Breakpoints
- Mobile: 375px - 767px
- Tablet: 768px - 1199px
- Desktop: 1200px+

---

## 🔐 Security Requirements

### Authentication
- JWT tokens for API authentication
- Secure password hashing with bcrypt
- Session management with secure cookies
- MFA support for sensitive operations
- Test credentials: admin@govli.ai / Admin123!

### Authorization
- Role-Based Access Control (RBAC)
- Department-level data isolation
- Granular permission checks on all endpoints
- Audit logging for all data access

### Data Protection
- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Sanitize all user inputs
- Prevent SQL injection with parameterized queries
- XSS protection in frontend
- CSRF token validation

### Compliance
- CJIS compliance for law enforcement data
- FedRAMP requirements for federal integration
- FISMA security controls
- Section 508 accessibility standards

---

## 📝 Code Standards

### General Rules
1. **No commented-out code** - Delete it or use feature flags
2. **No console.logs in production** - Use proper logging library
3. **Error handling required** - All async operations must have try-catch
4. **Meaningful variable names** - No single letters except iterators
5. **JSDoc comments** - Document all exported functions
6. **DRY principle** - Extract repeated code into functions/components

### API Endpoints
```javascript
// Standard format: /api/{resource}/{action}
GET    /api/permits              // List all permits
GET    /api/permits/:id          // Get specific permit
POST   /api/permits              // Create new permit
PUT    /api/permits/:id          // Update permit
DELETE /api/permits/:id          // Delete permit

// Always return consistent response format
{
  "success": true,
  "data": {...},
  "message": "Operation successful",
  "timestamp": "2024-11-20T10:30:00Z"
}

// Error responses
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-11-20T10:30:00Z"
}
```

### React Component Standards
```javascript
// 1. Imports
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// 2. Component definition
const ComponentName = ({ prop1, prop2 }) => {
  // 3. State declarations
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 4. Hooks
  const navigate = useNavigate();

  // 5. Effects
  useEffect(() => {
    fetchData();
  }, []);

  // 6. Event handlers
  const handleAction = async () => {
    try {
      setLoading(true);
      // API call
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // 7. Render conditions
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  // 8. Return JSX
  return (
    <div className="component-container">
      {/* Component content */}
    </div>
  );
};

export default ComponentName;
```

### Database Query Standards
```javascript
// Always use parameterized queries
const result = await pool.query(
  'SELECT * FROM permits WHERE department = $1 AND status = $2',
  [department, status]
);

// Never use string concatenation
// ❌ BAD: `SELECT * FROM permits WHERE id = ${id}`
// ✅ GOOD: Use $1, $2 placeholders

// Include error handling
try {
  const result = await pool.query(query, params);
  return result.rows;
} catch (error) {
  logger.error('Database query failed:', error);
  throw new Error('Failed to fetch data');
}
```

---

## 🧪 Testing Requirements

### Before Considering Feature Complete
- [ ] Manual testing with test account
- [ ] All API endpoints return proper status codes (200, 201, 400, 401, 403, 404, 500)
- [ ] Error messages are user-friendly (no stack traces exposed)
- [ ] Mobile responsive (test at 768px, 375px)
- [ ] Audit logging for all data changes
- [ ] Loading states during async operations
- [ ] No console errors in browser
- [ ] Works with existing authentication flow
- [ ] Database queries optimized (check for N+1 queries)
- [ ] Documentation added/updated

### Test Scenarios to Cover
1. **Happy path** - Feature works as expected
2. **Empty states** - No data to display
3. **Error states** - API fails, network issues
4. **Edge cases** - Boundary values, special characters
5. **Permission denied** - Unauthorized access attempts
6. **Concurrent operations** - Multiple users editing same data

---

## 📊 Audit Logging Standard

### What to Log
Every data modification must be logged:
```javascript
// Example audit log entry
{
  user_id: 123,
  action: 'UPDATE',
  resource_type: 'permit',
  resource_id: 456,
  changes: {
    status: { old: 'pending', new: 'approved' }
  },
  ip_address: '192.168.1.1',
  timestamp: '2024-11-20T10:30:00Z'
}
```

### Security Events to Log
- All login attempts (success and failure)
- Password changes
- Permission changes
- Data exports
- API access from new IPs
- Failed authentication attempts

---

## 🚀 Deployment Standards

### Git Workflow
```bash
# 1. Create feature branch
git checkout -b feature/feature-name

# 2. Make changes and commit frequently
git add .
git commit -m "Descriptive commit message"

# 3. Push to remote
git push -u origin feature/feature-name

# 4. Create pull request on GitHub
# 5. After review and approval, merge to main
```

### Commit Message Format
```
feat: Add user management dashboard
fix: Resolve authentication token expiration
docs: Update API documentation
refactor: Optimize permit query performance
test: Add unit tests for workflow engine
```

### Environment Variables
Never commit sensitive data. Use `.env` files:
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
MAPBOX_TOKEN=your-mapbox-token
```

---

## 🎯 Development Workflow

### Phase 1: Foundation (30 min)
- Database schema
- Basic API endpoint
- Simple UI component
- Manual testing

### Phase 2: Enhancement (1-2 hours)
- Complete CRUD operations
- Error handling
- Loading states
- Basic styling

### Phase 3: Polish (1-2 hours)
- Comprehensive error handling
- Audit logging
- Security validation
- Responsive design
- Documentation

### Phase 4: Integration (30 min)
- Add to navigation
- Link to other features
- Test data flow
- Update documentation

---

## 📋 Feature Development Checklist

When building a new feature:

### Backend
- [ ] Database migration created
- [ ] API routes defined
- [ ] Input validation implemented
- [ ] Authentication middleware applied
- [ ] Authorization checks in place
- [ ] Error handling comprehensive
- [ ] Audit logging added
- [ ] API documentation updated

### Frontend
- [ ] React components created
- [ ] API client functions added
- [ ] Loading states implemented
- [ ] Error handling implemented
- [ ] Form validation added
- [ ] Responsive design tested
- [ ] Accessibility checks passed
- [ ] Navigation integration complete

### Testing
- [ ] Manual testing completed
- [ ] Edge cases considered
- [ ] Error scenarios tested
- [ ] Mobile testing done
- [ ] Browser compatibility checked

### Documentation
- [ ] README updated
- [ ] API documentation added
- [ ] Code comments added
- [ ] User guide updated (if applicable)

---

## 🔄 Iterative Development Pattern

Always build features iteratively:

**Week 1**: Foundation
- Get basic version working
- Focus on core functionality
- Minimal but functional UI

**Week 2**: Enhancement
- Add secondary features
- Improve UI/UX
- Handle edge cases

**Week 3**: Polish
- Performance optimization
- Comprehensive testing
- Production hardening

**Week 4**: Integration
- Connect to other features
- End-to-end testing
- Documentation

---

## 🎓 Government-Specific Considerations

### Compliance First
- Every feature must consider CJIS requirements
- Audit trails are not optional
- Data retention policies must be followed
- Privacy controls are mandatory

### Integration over Replacement
- Work with existing legacy systems
- API-first architecture
- No "rip and replace" approaches
- Gradual migration strategies

### Performance Requirements
- Page load < 3 seconds
- API response < 500ms
- Support 1000+ concurrent users
- 99.9% uptime SLA

### Accessibility
- WCAG 2.1 AA compliance minimum
- Section 508 standards
- Keyboard navigation support
- Screen reader compatibility

---

## 💡 Best Practices

### DO:
✅ Break complex features into smaller components  
✅ Use existing patterns in the codebase  
✅ Write self-documenting code with clear names  
✅ Test as you build, not at the end  
✅ Commit working code frequently  
✅ Ask for clarification when requirements are unclear  
✅ Document non-obvious decisions in comments  
✅ Consider security implications of every change  

### DON'T:
❌ Build everything at once  
❌ Introduce new libraries without discussion  
❌ Commit broken code  
❌ Skip error handling  
❌ Hardcode configuration values  
❌ Ignore accessibility requirements  
❌ Copy-paste code without understanding  
❌ Leave TODO comments in production code  

---

## 📞 When You Need Help

### Before Asking for Help:
1. Read error messages carefully
2. Check console for warnings
3. Review similar code in the project
4. Search project documentation
5. Check Git history for related changes

### When Asking:
- Provide specific error messages
- Share relevant code snippets
- Explain what you've already tried
- Include expected vs actual behavior
- Mention which browser/environment

---

## 📚 Additional Resources

### Documentation Locations
- API Documentation: `/docs/api/`
- Database Schema: `/docs/database/`
- Component Library: `/docs/components/`
- Deployment Guide: `/docs/deployment/`

### External Resources
- React Documentation: https://react.dev
- Node.js Best Practices: https://github.com/goldbergyoni/nodebestpractices
- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Government Tech Standards: NIST, CJIS Security Policy

---

## 🔄 Keep This Document Updated

This rules.md file is a living document. When you:
- Add new patterns or conventions
- Discover better approaches
- Update architecture decisions
- Change deployment processes

**Update this file accordingly!**

---

*Last Updated: November 20, 2024*  
*Version: 2.0*

## 📋 Testing Requirements - Desktop/Mobile Verification

### Desktop Testing Checklist
Test on these browsers before deployment:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest, if on Mac)

**Desktop Test Scenarios**:
1. **Navigation**
   - [ ] All menu items clickable and navigate correctly
   - [ ] Sidebar expands/collapses smoothly
   - [ ] Breadcrumbs update correctly
   - [ ] Back button works as expected

2. **Forms**
   - [ ] All inputs accept data correctly
   - [ ] Validation messages show appropriately
   - [ ] Submit buttons work and show loading states
   - [ ] Error messages are clear and actionable
   - [ ] Success messages confirm actions

3. **Data Display**
   - [ ] Tables render correctly with all columns
   - [ ] Charts/graphs display without errors
   - [ ] Images load properly
   - [ ] Icons render correctly (Font Awesome/Lucide)
   - [ ] Pagination works if applicable

4. **Interactions**
   - [ ] Buttons show hover states
   - [ ] Modals open/close correctly
   - [ ] Dropdowns work and close on selection
   - [ ] Tooltips appear on hover
   - [ ] Drag-and-drop works (if applicable)

5. **Performance**
   - [ ] Page loads in < 3 seconds
   - [ ] No console errors
   - [ ] No console warnings (or justified ones only)
   - [ ] Smooth scrolling and transitions
   - [ ] No memory leaks (check DevTools)

### Mobile Testing Checklist
Test on actual devices or browser device emulation:

**Required Test Devices/Sizes**:
- [ ] iPhone (375px width) - iOS Safari
- [ ] Android phone (360px-414px) - Chrome
- [ ] iPad/Tablet (768px-1024px)

**Mobile-Specific Tests**:
1. **Touch Interactions**
   - [ ] All buttons are tappable (min 44x44px)
   - [ ] Swipe gestures work where implemented
   - [ ] Pull-to-refresh works (if implemented)
   - [ ] No accidental touches on nearby elements
   - [ ] Pinch-to-zoom disabled on input fields

2. **Layout**
   - [ ] No horizontal scrolling (unless intentional)
   - [ ] Text is readable without zooming (min 16px)
   - [ ] Images scale appropriately
   - [ ] Buttons fit within viewport
   - [ ] Forms don't overflow screen

3. **Navigation**
   - [ ] Hamburger menu opens/closes smoothly
   - [ ] Menu items are easily tappable
   - [ ] Bottom navigation works (if used)
   - [ ] No elements hidden under keyboard when typing

4. **Forms on Mobile**
   - [ ] Keyboard opens correctly for input type
   - [ ] Form doesn't jump when keyboard appears
   - [ ] Submit button visible with keyboard open
   - [ ] Auto-capitalize/autocorrect set appropriately
   - [ ] Date/number pickers use native controls

5. **Performance**
   - [ ] Page loads in < 5 seconds on 3G
   - [ ] Animations are smooth (60fps)
   - [ ] Images are optimized for mobile
   - [ ] No memory issues on low-end devices

### Cross-Device Testing Notes
```javascript
// Test with different screen sizes in DevTools
// Chrome DevTools: Cmd/Ctrl + Shift + M

// Common breakpoints to test:
// - 375px (iPhone SE, small phones)
// - 414px (iPhone Plus, large phones)
// - 768px (iPad portrait, tablets)
// - 1024px (iPad landscape, small laptops)
// - 1280px (Standard laptop)
// - 1920px (Desktop monitors)
```

### Accessibility Testing
- [ ] Keyboard navigation works (Tab, Enter, Escape, Arrow keys)
- [ ] Screen reader announces content correctly (test with NVDA/JAWS)
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] All images have alt text
- [ ] Form fields have labels
- [ ] Error messages are announced by screen readers

### Load Testing
```bash
# Use browser DevTools Network tab
# Throttle to "Fast 3G" or "Slow 3G"
# Check total page weight:
# - Target: < 2MB total
# - Images: Optimized and compressed
# - JavaScript: Minified and code-split
# - CSS: Minified
```

---

## 🔍 Code Review Checklist

Before submitting PR or merging code:

### Functionality
- [ ] Feature works as specified
- [ ] Edge cases handled
- [ ] Error cases handled
- [ ] No breaking changes to existing features
- [ ] Data validates correctly
- [ ] API returns correct status codes

### Code Quality
- [ ] Code is readable and well-organized
- [ ] Functions are small and focused
- [ ] No duplicate code (DRY principle)
- [ ] Meaningful variable/function names
- [ ] Complex logic has comments explaining why
- [ ] No commented-out code
- [ ] No console.log in production code

### Security
- [ ] Input validation on backend
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (React escaping or sanitization)
- [ ] Authentication/authorization checked
- [ ] Sensitive data not logged
- [ ] No credentials in code
- [ ] Audit logging implemented

### Performance
- [ ] No N+1 database queries
- [ ] Database indexes used appropriately
- [ ] Images optimized and lazy-loaded
- [ ] Large lists virtualized or paginated
- [ ] Expensive calculations memoized
- [ ] API responses paginated if large

### Accessibility
- [ ] Keyboard navigation works
- [ ] ARIA labels where needed
- [ ] Color contrast sufficient
- [ ] Focus indicators visible
- [ ] Alt text on images
- [ ] Form labels present

### Testing
- [ ] Manually tested on desktop
- [ ] Manually tested on mobile
- [ ] Tested in multiple browsers
- [ ] Tested with keyboard only
- [ ] Tested error scenarios
- [ ] Tested loading states

### Documentation
- [ ] README updated if needed
- [ ] API documentation updated
- [ ] Comments added for complex logic
- [ ] CHANGELOG updated (if using)

---

## 🚀 Deployment Checklist

Before deploying to production:

### Pre-Deployment
- [ ] All tests pass
- [ ] Code reviewed and approved
- [ ] No console errors or warnings
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Backup of database taken
- [ ] Rollback plan prepared

### Deployment Steps
1. [ ] Merge to main branch (or deployment branch)
2. [ ] Verify CI/CD pipeline passes
3. [ ] Monitor deployment logs
4. [ ] Check application starts successfully
5. [ ] Verify database migrations applied
6. [ ] Test critical user flows
7. [ ] Monitor error tracking (if available)
8. [ ] Check performance metrics

### Post-Deployment
- [ ] Smoke test in production
- [ ] Verify authentication works
- [ ] Test critical features
- [ ] Check logs for errors
- [ ] Monitor performance
- [ ] Notify stakeholders of deployment

### Rollback Procedure
If deployment fails:
```bash
# 1. Revert to previous deployment
git revert HEAD
git push

# 2. Or rollback via deployment platform
# Vercel: Redeploy previous build
# Render: Rollback to previous deploy

# 3. Verify application is stable
# 4. Investigate issue in non-production environment
# 5. Fix and redeploy
```

---

## 📚 Quick Reference

### Common Commands
```bash
# Start development environment
cd ~/Govli-AI-v2
docker-compose up

# View logs
docker-compose logs -f

# Stop environment
docker-compose down

# Rebuild after dependency changes
docker-compose up --build

# Run database migrations
cd backend
npm run migrate

# Check for security vulnerabilities
npm audit

# Update dependencies
npm update
```

### Environment Files
```bash
# Backend .env
DATABASE_URL=postgresql://...
JWT_SECRET=...
PORT=5000
NODE_ENV=development

# Frontend .env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_MAPBOX_TOKEN=...
```

### Useful Tools
- **Database**: pgAdmin, Postico, or DBeaver for PostgreSQL management
- **API Testing**: Postman, Insomnia, or Thunder Client (VS Code)
- **Accessibility**: axe DevTools, WAVE, Lighthouse
- **Performance**: Chrome DevTools Performance tab, Lighthouse
- **Debugging**: Chrome DevTools, React DevTools

---

## 🎯 Development Priorities

When working on new features, prioritize in this order:

1. **Security** - Never compromise on security
2. **Functionality** - Feature must work correctly
3. **Accessibility** - Must be usable by everyone
4. **Performance** - Must be reasonably fast
5. **Polish** - Nice-to-have improvements

Remember: A secure, functional, accessible, and performant feature is better than a beautifully polished feature that fails in the basics.

---

## ❓ FAQ

### Q: Can I use a new npm package?
**A**: Ask first. Consider:
- Is there existing functionality that does this?
- How large is the package?
- Is it actively maintained?
- Does it have security vulnerabilities?
- Is it really needed or just nice-to-have?

### Q: Should I refactor existing code?
**A**: Create a separate PR for refactoring. Don't mix feature work with refactoring. Test thoroughly after refactoring.

### Q: How do I handle merge conflicts?
**A**: 
```bash
git pull origin main
# Fix conflicts in files
git add .
git commit -m "Resolve merge conflicts"
git push
```

### Q: What if I'm stuck?
**A**: 
1. Read error messages carefully
2. Check documentation
3. Search codebase for similar patterns
4. Use browser DevTools/debugger
5. Ask for help with specific details

---

## 📞 Support & Resources

### When You Need Help
- Include error messages (full stack trace if available)
- Share relevant code snippets
- Explain what you expected vs what happened
- Mention what you've already tried
- Include browser/environment details

### Documentation Links
- **React**: https://react.dev
- **PostgreSQL**: https://www.postgresql.org/docs/
- **Node.js**: https://nodejs.org/docs/
- **Express**: https://expressjs.com/
- **Docker**: https://docs.docker.com/

### Government Standards
- **CJIS Security Policy**: https://www.fbi.gov/services/cjis/cjis-security-policy-resource-center
- **Section 508**: https://www.section508.gov/
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/
- **NIST Cybersecurity Framework**: https://www.nist.gov/cyberframework

---

## 🔄 Document Updates

This RULES.md document is a living guide that should be updated as the project evolves.

### When to Update This Document
- New architectural patterns are established
- New tools or libraries are added to the stack
- New security requirements are identified
- New accessibility standards are adopted
- New deployment processes are implemented
- Lessons learned from production issues

### How to Update
1. Create feature branch
2. Update RULES.md with new information
3. Create PR with clear explanation of changes
4. Get team review and approval
5. Merge to main

---

## ✅ Final Reminders

1. **Branch before every feature** - Never commit to main
2. **Test thoroughly** - Desktop, mobile, accessibility
3. **Preserve existing features** - Don't break what works
4. **Use real government names** - Build credibly
5. **Handle all errors** - Never let failures crash the app
6. **Secure everything** - Validate, sanitize, authenticate
7. **Log all changes** - Audit trail is mandatory
8. **Document your work** - Help future developers
9. **Ask when unsure** - Better to ask than assume
10. **Take pride in your code** - You're building for government agencies

---

*Last Updated: November 20, 2024*  
*Version: 2.1 - Consolidated with Testing & Mobile Requirements*  
*Maintained by: Govli AI Development Team*

