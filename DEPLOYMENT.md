# 🚀 Smak v2 Deployment Guide

This guide covers deploying Smak v2 to production while maintaining complete separation from the v1 system.

## 🎯 Deployment Strategy

### Parallel Deployment Approach
- Deploy v2 to a **separate Vercel project**
- Use **different domain/subdomain** from v1
- Maintain **independent database** (separate Supabase project)
- Enable **gradual migration** with zero v1 downtime

## 📋 Pre-Deployment Checklist

### 1. Supabase v2 Production Setup
- [ ] Create production Supabase project (separate from v1)
- [ ] Run `supabase_schema_v2.sql` in production database
- [ ] Configure Row Level Security policies
- [ ] Set up authentication providers
- [ ] Configure CORS for production domain
- [ ] Create admin user and set approval status

### 2. Environment Configuration
- [ ] Production environment variables
- [ ] Supabase production URL and keys
- [ ] Error tracking (Sentry, etc.)
- [ ] Analytics configuration
- [ ] Performance monitoring

### 3. Security Verification
- [ ] RLS policies tested
- [ ] Authentication flows verified
- [ ] API security endpoints checked
- [ ] User permissions validated
- [ ] Data isolation confirmed

## 🌐 Vercel Deployment

### Option 1: Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to new project
cd smak-v2
vercel --name smak-v2-production

# Set environment variables
vercel env add VITE_SUPABASE_V2_URL production
vercel env add VITE_SUPABASE_V2_ANON_KEY production

# Deploy
vercel --prod
```

### Option 2: GitHub Integration

1. Connect GitHub repository to Vercel
2. Create **new Vercel project** (don't overwrite v1)
3. Set build settings:
   - **Framework**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Configure environment variables in Vercel dashboard

### Environment Variables

```env
# Production Environment Variables
VITE_SUPABASE_V2_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_V2_ANON_KEY=your-production-anon-key
```

## 🗄️ Database Migration Strategy

### Phase 1: Parallel Operation (Recommended)
- v1 continues normal operation
- v2 deployed with fresh database
- Both systems run independently
- Gradual user testing on v2

### Phase 2: Data Migration (When Ready)
```sql
-- Example migration queries (adapt as needed)

-- Export from v1 (if needed)
-- Transform data to v2 schema format
-- Import into v2 with proper foreign key relationships

-- Verify data integrity
SELECT COUNT(*) FROM stores;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM current_inventory;
```

### Phase 3: Traffic Migration
- DNS updates to point to v2
- v1 maintained as backup
- Monitor performance and issues
- Rollback capability preserved

## 🔐 Security Considerations

### Production Security Setup
1. **Database Security**
   - Enable RLS on all tables
   - Configure proper user policies
   - Regular security audits
   - Backup and recovery plan

2. **API Security**
   - Rate limiting
   - CORS configuration
   - Authentication validation
   - Input sanitization

3. **Infrastructure Security**
   - HTTPS enforcement
   - Environment variable security
   - Access logging
   - Monitoring and alerts

## 📊 Monitoring & Analytics

### Essential Monitoring
- Application performance (Web Vitals)
- Error tracking and reporting
- Database performance metrics
- User authentication flows
- API response times

### Recommended Tools
- **Error Tracking**: Sentry
- **Analytics**: Google Analytics 4
- **Performance**: Vercel Analytics
- **Database**: Supabase Logs
- **Uptime**: UptimeRobot

## 🔄 CI/CD Pipeline

### Automated Deployment
```yaml
# .github/workflows/deploy.yml
name: Deploy Smak v2
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd frontend && npm ci
      - run: cd frontend && npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          working-directory: frontend
```

## 🚨 Rollback Plan

### Emergency Rollback Procedure
1. **DNS Rollback**: Point domain back to v1
2. **Database Rollback**: Restore v1 database if needed
3. **Communication**: Notify users of temporary service
4. **Investigation**: Identify and fix v2 issues
5. **Re-deployment**: Fix issues and redeploy v2

### Rollback Checklist
- [ ] DNS records updated
- [ ] v1 system verified operational
- [ ] Users notified
- [ ] Issue tracking started
- [ ] Rollback time logged

## 📈 Performance Optimization

### Frontend Optimization
- Code splitting and lazy loading
- Image optimization
- Bundle size monitoring
- CDN configuration
- Caching strategies

### Database Optimization
- Query performance monitoring
- Index optimization
- Connection pooling
- Regular maintenance

## 🎯 Success Metrics

### Key Performance Indicators
- **Uptime**: > 99.9%
- **Response Time**: < 200ms average
- **Error Rate**: < 0.1%
- **User Satisfaction**: Monitor feedback
- **Migration Success**: Data integrity verified

### Go-Live Checklist
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Monitoring configured
- [ ] Team trained on new system
- [ ] Documentation updated
- [ ] Rollback plan tested

## 📞 Support & Maintenance

### Post-Deployment Support
- 24-hour monitoring period
- Immediate bug fix capability
- User support documentation
- Team on-call schedule
- Performance monitoring

### Long-term Maintenance
- Regular security updates
- Performance optimization
- Feature enhancement pipeline
- User feedback integration
- System health monitoring

---

## 🚨 Critical Reminders

- **NEVER** deploy v2 over v1 infrastructure
- **ALWAYS** use separate domains and databases
- **TEST** thoroughly in staging environment
- **MONITOR** closely after deployment
- **BACKUP** all data before major changes

---

**Smak v2** - Deployed with confidence and security! 🎉 