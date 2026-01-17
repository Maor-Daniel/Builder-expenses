# Production Standards - Builder Expenses

## 🎯 Mission: Production-Ready Code Only

Every commit, every feature, every bug fix MUST meet production standards. No exceptions.

---

## 📋 Pre-Commit Checklist

### ✅ Code Quality
- [ ] No console errors or warnings in browser DevTools
- [ ] No CSP (Content Security Policy) violations
- [ ] All ESLint/linting rules pass
- [ ] No hardcoded values (API keys, URLs, credentials)
- [ ] All environment variables properly configured
- [ ] Code follows existing patterns and conventions
- [ ] Hebrew RTL support maintained
- [ ] Mobile responsive (320px minimum width)

### ✅ Security
- [ ] No secrets in code (API keys, passwords, tokens)
- [ ] CORS properly configured (whitelist only)
- [ ] Input validation on all user inputs
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (proper escaping)
- [ ] CSRF protection where applicable
- [ ] Authentication required on protected endpoints
- [ ] Rate limiting implemented on public endpoints

### ✅ Testing
- [ ] Manual testing completed on affected features
- [ ] Mobile app tested (if backend changes)
- [ ] Web app tested on Chrome, Safari, Firefox
- [ ] Tested on mobile viewport (375px, 768px)
- [ ] RTL Hebrew layout verified
- [ ] Dark mode tested (if UI changes)
- [ ] Error scenarios tested
- [ ] Edge cases considered

### ✅ Performance
- [ ] No memory leaks
- [ ] No N+1 queries
- [ ] Lazy loading where appropriate
- [ ] Images optimized
- [ ] API responses under 2 seconds
- [ ] Bundle size reasonable
- [ ] CDN resources cached properly

### ✅ Accessibility
- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Sufficient color contrast (4.5:1 minimum)
- [ ] Alt text on images
- [ ] ARIA labels where needed
- [ ] Focus states visible

### ✅ Documentation
- [ ] Code comments on complex logic
- [ ] API endpoints documented
- [ ] README updated (if applicable)
- [ ] Environment variables documented
- [ ] Breaking changes noted in commit message

---

## 🚫 Never Allow in Production

### Absolute No-Go Items:
- ❌ `console.log()` statements (use proper logging)
- ❌ Hardcoded credentials or API keys
- ❌ `TODO` or `FIXME` comments without issue tracking
- ❌ Commented-out code blocks
- ❌ Test data or mock data in production code
- ❌ Unhandled promise rejections
- ❌ Unhandled errors (always catch and log)
- ❌ CORS wildcard (`*`) in production
- ❌ Disabled security features for debugging
- ❌ Development dependencies in production bundles
- ❌ Source maps exposed in production (optional, but preferred)
- ❌ CSP violations or browser console warnings
- ❌ Accessibility violations

---

## 🔍 Code Review Standards

### Every Pull Request Must:
1. **Pass Automated Tests**
   - Secret scanning (Husky pre-commit hook)
   - Linting checks
   - Build succeeds without warnings

2. **Include Proper Commit Messages**
   ```
   type(scope): Brief description (max 72 chars)

   - Detailed explanation of changes
   - Why the change was needed
   - What alternatives were considered
   - Any breaking changes

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

3. **Be Tested Manually**
   - Reviewer must test the changes
   - Screenshot evidence for UI changes
   - API testing for backend changes

4. **Have Zero Console Warnings**
   - Check browser DevTools Console
   - Check browser DevTools Network tab
   - Check CloudWatch logs (for backend)

---

## 🧪 Testing Protocol

### Before Every Commit:
1. **Run Local Tests**
   ```bash
   # Check for secrets
   git diff --staged | grep -i "api.*key\|secret\|password\|token"

   # Run automated test script
   ./test-commits.sh
   ```

2. **Manual Browser Testing**
   - Open DevTools Console (F12)
   - Check for errors (red messages)
   - Check for warnings (yellow messages)
   - Verify no CSP violations
   - Check Network tab for failed requests

3. **Mobile App Testing** (if backend changes)
   - Test on iOS simulator
   - Test on Android emulator
   - Verify API calls succeed
   - Check for crashes or errors

4. **Accessibility Testing**
   - Tab through page (keyboard only)
   - Use screen reader (VoiceOver/NVDA)
   - Check color contrast
   - Verify ARIA labels

### Before Every Deploy:
1. **Staging Deployment First**
   - Deploy to staging environment
   - Run full regression tests
   - Monitor CloudWatch logs for 1 hour
   - Get approval from QA/stakeholders

2. **Production Deployment**
   - Blue-green deployment strategy
   - Gradual rollout (10% → 50% → 100%)
   - Monitor error rates closely
   - Have rollback plan ready

---

## 📊 Quality Metrics (Minimum Standards)

### Performance
- **Page Load:** < 3 seconds (3G connection)
- **API Response:** < 2 seconds (p95)
- **Time to Interactive:** < 5 seconds
- **Lighthouse Score:** > 90 (Performance)

### Security
- **OWASP Top 10:** Zero vulnerabilities
- **Dependency Vulnerabilities:** Zero critical/high
- **Secret Scanning:** Zero exposed secrets
- **HTTPS:** Enforced everywhere

### Accessibility
- **WCAG 2.1 AA:** Full compliance
- **Lighthouse Score:** > 90 (Accessibility)
- **Keyboard Navigation:** 100% functional
- **Screen Reader:** All content accessible

### Code Quality
- **Test Coverage:** > 70% (when tests exist)
- **Code Duplication:** < 5%
- **Complexity:** < 10 per function
- **Bundle Size:** < 500KB (initial load)

---

## 🐛 Bug Fix Standards

### Every Bug Fix Must Include:
1. **Root Cause Analysis**
   - What caused the bug?
   - Why wasn't it caught earlier?
   - How can we prevent similar bugs?

2. **Regression Test**
   - Add test to prevent recurrence
   - Document the test scenario
   - Include in automated suite (if applicable)

3. **Impact Assessment**
   - Who was affected?
   - What data was impacted?
   - Is data migration needed?

---

## 🚀 Deployment Standards

### Pre-Deployment Checklist:
- [ ] All tests pass (automated + manual)
- [ ] No console warnings or errors
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] CloudWatch dashboard updated
- [ ] Stakeholders notified

### Post-Deployment Monitoring (First 24 Hours):
- [ ] Monitor error rates (< 1% is acceptable)
- [ ] Check API latency (< 2s p95)
- [ ] Verify mobile app works
- [ ] Verify web app works
- [ ] Check CORS violations (should be 0)
- [ ] Monitor user feedback/support tickets
- [ ] Review CloudWatch logs for anomalies

### Rollback Triggers (Immediate):
- Error rate > 5%
- API latency > 5 seconds
- Mobile app crashes
- Authentication failures
- Payment processing errors
- Data corruption detected
- Security breach detected

---

## 🔧 Environment Configuration

### Required Environment Variables:
```bash
# Production only
NODE_ENV=production
AWS_REGION=us-east-1

# API Keys (NEVER commit these)
CLERK_PUBLISHABLE_KEY=pk_***
CLERK_SECRET_KEY=sk_***
STRIPE_SECRET_KEY=sk_***
APPLE_IAP_SHARED_SECRET=***
PADDLE_API_KEY=***

# Service URLs
API_GATEWAY_URL=https://***
CLOUDFRONT_DISTRIBUTION=https://d6dvynagj630i.cloudfront.net
```

### Variable Validation:
- All required variables must be set
- Variables must be validated at startup
- Missing variables should fail fast with clear error

---

## 📝 Commit Message Standards

### Format:
```
type(scope): Brief description

Detailed explanation:
- What changed
- Why it changed
- How to test
- Breaking changes (if any)

Fixes #123
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Types:
- `feat:` New feature
- `fix:` Bug fix
- `security:` Security fix (URGENT)
- `perf:` Performance improvement
- `refactor:` Code refactoring
- `style:` Code style changes
- `docs:` Documentation only
- `test:` Test changes
- `chore:` Build/tooling changes

### Examples:
```
feat(payments): Add Apple In-App Purchase integration

- Added APPLE_PRODUCT_IDS mapping
- Updated tier pricing to match App Store
- Added webhook handler for Apple receipts

Tested on iOS simulator and production App Store sandbox.

security(cors): Disable ALLOW_ALL_ORIGINS in production

SECURITY CRITICAL: Changed ALLOW_ALL_ORIGINS from true to false
to prevent CORS bypass attacks. Mobile apps unaffected.

Tested: Mobile app works, browser origins validated.
```

---

## 🎨 UI/UX Standards

### Design Requirements:
- **Consistency:** Follow existing design patterns
- **Responsive:** Mobile-first (320px minimum)
- **RTL Support:** All Hebrew text right-to-left
- **Dark Mode:** Support light + dark themes
- **Accessibility:** WCAG 2.1 AA compliant
- **Performance:** No layout shifts, smooth animations

### Component Standards:
- Reuse existing components where possible
- New components must be documented
- Props must be validated
- Error states must be handled
- Loading states must be visible

---

## 🔐 Security Standards

### Authentication & Authorization:
- Use Clerk for all authentication
- JWT tokens expire in 1 hour
- Refresh tokens expire in 30 days
- Session timeout after 15 minutes inactivity
- Rate limiting on auth endpoints (5 attempts/15 min)

### Data Protection:
- All PII encrypted at rest
- All traffic uses HTTPS
- Secrets stored in AWS Secrets Manager
- Database backups encrypted
- Audit logs for sensitive operations

### API Security:
- CORS whitelist only (no wildcards)
- Request size limits (1MB max)
- Input validation on all endpoints
- SQL injection protection
- XSS protection
- CSRF tokens where needed

---

## 📈 Monitoring Standards

### Required Monitoring:
1. **CloudWatch Dashboards**
   - API error rates
   - API latency (p50, p95, p99)
   - CORS violations
   - Authentication failures
   - Payment failures

2. **Alerts** (PagerDuty/SNS)
   - Error rate > 5%
   - API latency > 5s
   - CORS violations > 10/min
   - Auth failures > 50/min
   - Database connection failures

3. **Logging**
   - All errors with stack traces
   - Security events (CORS, auth)
   - Payment transactions
   - User actions (audit trail)

---

## 🛠️ Developer Workflow

### Daily:
1. Pull latest changes
2. Run tests before starting work
3. Write code following standards
4. Test manually before committing
5. Run `./test-commits.sh`
6. Commit with proper message
7. Push to feature branch
8. Create PR with description

### Weekly:
1. Review dependency updates
2. Check security advisories
3. Review CloudWatch dashboards
4. Update documentation
5. Refactor technical debt

### Monthly:
1. Security audit
2. Performance review
3. Accessibility audit
4. Code quality review
5. Update standards document

---

## 🎯 Definition of Done

A feature is DONE when:
- ✅ Code written and reviewed
- ✅ All tests pass (automated + manual)
- ✅ No console errors or warnings
- ✅ Documentation updated
- ✅ Accessibility verified (WCAG 2.1 AA)
- ✅ Mobile responsive (320px+)
- ✅ Dark mode tested (if UI)
- ✅ RTL Hebrew tested
- ✅ Security reviewed
- ✅ Performance acceptable
- ✅ Deployed to staging
- ✅ QA approved
- ✅ Deployed to production
- ✅ Monitoring configured
- ✅ Stakeholders notified

---

## 📚 Resources

### Internal:
- [CLAUDE.md](./CLAUDE.md) - AI agent orchestration
- [test-commits.sh](./test-commits.sh) - Automated testing
- [CORS Config](./lambda/shared/cors-config.js) - Security reference

### External:
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [AWS Best Practices](https://aws.amazon.com/architecture/well-architected/)
- [Clerk Documentation](https://clerk.com/docs)

---

## 🚨 When to Escalate

### Immediate Escalation (Severity 1):
- Security breach detected
- Data corruption or loss
- Authentication system down
- Payment processing broken
- Production deployment failing

### Same-Day Escalation (Severity 2):
- Performance degradation > 50%
- Feature completely broken
- Mobile app crashes
- API error rate > 10%

### Next-Day Escalation (Severity 3):
- Minor bugs
- UI inconsistencies
- Non-critical warnings
- Documentation gaps

---

## 📞 Support

For questions about these standards:
1. Check this document first
2. Review existing code patterns
3. Ask team for clarification
4. Update this document with learnings

---

**Last Updated:** 2026-01-17
**Version:** 1.0
**Maintainer:** Development Team

---

## ⚡ Quick Reference

**Before Committing:**
```bash
./test-commits.sh && echo "✅ Ready to commit" || echo "❌ Fix issues first"
```

**Before Pushing:**
```bash
# Verify no secrets
git diff origin/main | grep -i "secret\|api.*key\|password"

# Push
git push origin main
```

**After Deploying:**
```bash
# Monitor logs for 30 minutes
aws logs tail /aws/lambda/YOUR_FUNCTION --follow
```

---

**Remember: Production quality is not optional. It's the baseline.**
