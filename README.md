# SenteLoans - Open Source SACCO & MFI Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green)](https://supabase.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> 🌍 **Empowering African financial institutions with modern, accessible technology**

SenteLoans is an open-source digital platform designed specifically for African Savings and Credit Cooperatives (SACCOs), Microfinance Institutions (MFIs), and Money Lenders. Built with a mobile-first approach and optimized for low-bandwidth environments, SenteLoans helps financial institutions across Africa digitize their operations while preserving community-focused values.

## 🌟 Why SenteLoans?

- **🇺🇬 Built for Africa**: Designed with African market realities in mind - low bandwidth, mobile-first, local payment methods
- **💰 Free & Open Source**: MIT licensed - use, modify, and deploy without restrictions
- **🏢 Multi-Tenant**: One installation supports multiple institutions with complete data isolation
- **📱 Mobile-First**: Optimized for mobile devices and low-bandwidth environments
- **🔒 Secure by Default**: Row-level security, audit logging, and compliance-ready
- **🌐 Multi-Language**: English and Luganda, with easy extensibility to other African languages
- **🚀 Production Ready**: Built with enterprise-grade technologies (Next.js, TypeScript, Supabase)

## 🌟 Project Overview

Sente Loan currently empowers Ugandan Saccos, money lenders and Micro finance institutions to transition from manual, paper-based operations to a modern digital platform that tracks member data, manages loan lifecycles, and generates comprehensive financial reports. The platform maintains the community-focused values that define Ugandan Saccos while providing transparency, efficiency, and scalability.

## 🎯 Project Goals

- **Digitize SACCO Operations**: Transform traditional cooperative banking from manual processes to digital workflows
- **Enhance Member Experience**: Provide transparent access to account information and loan status
- **Improve Financial Management**: Enable data-driven decision making with real-time analytics
- **Ensure Compliance**: Maintain proper KYC documentation and regulatory reporting
- **Scale Operations**: Support SACCO growth with efficient member and loan management

## 🚀 Key Features

### Member Management
- Complete member registration with KYC verification
- Next-of-kin information and document storage
- Member profile management and status tracking
- Search and filtering capabilities

### Loan Management
- End-to-end loan processing from application to repayment
- Automated payment calculations and schedules
- Loan status tracking and approval workflows
- Risk assessment and portfolio analysis

### Savings & Transactions
- Multi-account savings management (Voluntary, Fixed, Shares)
- Deposit and withdrawal processing
- Transaction history and account balance tracking
- Payment method integration

### Reports & Analytics
- Real-time financial dashboards
- Portfolio performance metrics
- Member growth analytics
- Exportable reports for compliance

### Additional Features
- Mobile-responsive design optimized for all devices
- Dark/light theme support
- Role-based access control
- WhatsApp integration for customer support

## 👥 User Types

- **SACCO Manager**: Strategic oversight with comprehensive analytics and reporting
- **Loan Officer**: Day-to-day loan processing and member relationship management
- **Treasurer/Auditor**: Financial reporting, compliance tracking, and audit trails
- **SACCO Member**: Self-service portal for account information and loan applications

## 🛠 Technical Stack

### Frontend
- **Framework**: Next.js 14.2.25 with App Router
- **Language**: TypeScript 5
- **Runtime**: React 19
- **Styling**: Tailwind CSS 4.1.9 with custom design system
- **UI Components**: Radix UI primitives with shadcn/ui
- **Icons**: Lucide React
- **Fonts**: Geist Sans & Mono

### Form Handling & Validation
- **Form Management**: React Hook Form
- **Validation**: Zod schema validation
- **Date Handling**: date-fns, react-day-picker

### Data Visualization
- **Charts**: Recharts for analytics dashboards
- **Progress Indicators**: Custom progress components

### State Management
- **Client State**: React hooks and context
- **Server State**: Next.js server components and actions
- **Theme Management**: next-themes for dark/light mode

### Backend & Database
- **Server Actions**: Next.js server actions for form processing
- **Database**: Supabase for PostgreSQL database with Row-Level Security
- **Authentication**: Supabase Auth with JWT tokens
- **File Storage**: Vercel Blob for KYC documents and user uploads
- **Email Integration**: Mailgun API for contact forms and notifications


### Notifications & UX
- **Toast Notifications**: Sonner
- **Loading States**: Custom loading components
- **Error Handling**: Comprehensive error boundaries

### Development Tools
- **Package Manager**: pnpm
- **Linting**: ESLint with Next.js configuration
- **Type Safety**: Strict TypeScript configuration
- **Styling Utilities**: clsx, tailwind-merge, class-variance-authority

## 🎨 Design System

### Brand Colors
- **Primary**: Navy Blue (#1A2F5B) - Trust and stability
- **Accent**: Warm Orange (#F08C2B) - Energy and approachability
- **Neutral**: Charcoal Gray (#4A4A4A) - Professional text
- **Background**: Light Gray (#F5F5F5) - Clean surfaces

### Typography
- **Primary Font**: Inter (Google Fonts)
- **Fallback**: ui-sans-serif, system-ui, sans-serif
- **Scale**: Responsive typography with mobile-first approach

### Component Patterns
- **Border Radius**: 8px for consistency
- **Shadows**: Subtle elevation with shadow-sm
- **Focus States**: Navy blue ring indicators
- **Spacing**: Consistent Tailwind spacing scale

## 🚀 Development Practices

### Package Management
- **pnpm**: Fast, disk space efficient package manager
- **Lock File**: pnpm-lock.yaml for consistent installs

### Code Quality
- **TypeScript**: Strict type checking enabled
- **ESLint**: Next.js recommended configuration
- **Component Architecture**: Modular, reusable components
- **File Organization**: Feature-based folder structure

### Styling Approach
- **Utility-First**: Tailwind CSS for rapid development
- **Component Variants**: Class Variance Authority for type-safe styling
- **Design Tokens**: CSS custom properties for theming
- **Responsive Design**: Mobile-first breakpoint system

### State Management
- **Server Components**: Leverage Next.js server-side rendering
- **Client State**: React hooks for local component state
- **Form State**: React Hook Form for complex forms
- **Theme State**: next-themes for user preferences

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/oquidave/senteloans.git
cd senteloans

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run database migrations
# See INSTALLATION.md for detailed instructions

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

📚 **New to SenteLoans?** Check out our [Installation Guide](INSTALLATION.md) for detailed setup instructions.

## 📖 Documentation

- **[Installation Guide](INSTALLATION.md)** - Complete setup instructions for development and production
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project
- **[Security Policy](SECURITY.md)** - Security best practices and reporting vulnerabilities
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community guidelines
- **[Test Coverage](TEST_COVERAGE_SUMMARY.md)** - Current test coverage status

## 🌍 African Market Features

### Mobile-First Design
- Optimized for 3G/4G networks common across Africa
- Progressive image loading and lazy loading
- Minimal data usage with efficient caching
- Offline-capable architecture (coming soon)

### Local Payment Integration (Planned)
- **Mobile Money**: MTN Mobile Money, Airtel Money integration
- **USSD Access**: For feature phones without internet
- **SMS Notifications**: Transaction alerts via SMS

### Multi-Language Support
- English (default)
- Luganda (Uganda)
- Extensible to Swahili, Amharic, and other African languages

### Regulatory Compliance
- Uganda Bank of Uganda (BOU) compliance ready
- KYC/AML workflows built-in
- Audit trails for all financial transactions
- Data privacy and protection

## 🌍 Localization & Accessibility

- **Language**: English (with consideration for Ugandan context)
- **Currency**: Uganda Shillings (UGX)
- **Date Format**: DD/MM/YYYY (configurable)
- **Accessibility**: WCAG AA compliant with proper ARIA labels
- **Mobile Support**: Responsive design for all screen sizes

## 🤝 Contributing

We welcome contributions from developers, designers, financial experts, and community members! SenteLoans is built by the community, for the community.

### Ways to Contribute

- 🐛 **Report bugs** - Help us identify and fix issues
- 💡 **Suggest features** - Share ideas for improvements
- 📝 **Improve documentation** - Help others understand the project
- 🌍 **Translate** - Add support for more African languages
- 💻 **Submit code** - Fix bugs or implement new features
- 🎨 **Design** - Improve UI/UX
- 📢 **Spread the word** - Share SenteLoans with others

👉 **Get started**: Read our [Contributing Guide](CONTRIBUTING.md)

## 🏆 Contributors

Thanks to all the amazing people who have contributed to SenteLoans! 🎉

<!-- Add contributors here -->

## 💬 Community & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/YOUR_USERNAME/senteloans/issues)
- **GitHub Discussions**: [Ask questions and share ideas](https://github.com/YOUR_USERNAME/senteloans/discussions)
- **Documentation**: Check our comprehensive docs in this repository

For security vulnerabilities, please see our [Security Policy](SECURITY.md).

## 🔒 Security & Compliance

- **Data Protection**: Secure handling of sensitive financial information
- **KYC Compliance**: Proper documentation and verification workflows
- **Role-Based Access**: Appropriate permissions for different user types
- **Audit Trails**: Comprehensive logging for financial transactions
- **Row-Level Security**: Supabase RLS ensures data isolation between institutions
- **Encrypted Storage**: All sensitive data encrypted at rest and in transit

⚠️ **Found a security vulnerability?** Please report it responsibly via our [Security Policy](SECURITY.md).

## 📊 Project Status

- ✅ **Core Features**: Member management, Loans, Savings, Transactions
- ✅ **Multi-Tenant**: Full institution isolation
- ✅ **Authentication**: Secure login and role-based access
- ✅ **Notifications**: In-app notification system
- ✅ **KYC Management**: Document upload and verification
- 🚧 **Mobile Money**: Integration planned
- 🚧 **USSD Access**: Under development
- 🚧 **Mobile Apps**: Native apps planned

## 📈 Roadmap

### Phase 1: Core Platform (Current)
- [x] Multi-tenant architecture
- [x] Member/Client management
- [x] Loan lifecycle management
- [x] Savings and shares
- [x] Transaction tracking
- [x] Reports and analytics

### Phase 2: Enhanced Features (Q1 2025)
- [ ] Mobile Money integration (MTN, Airtel)
- [ ] SMS notifications
- [ ] Advanced reporting and exports
- [ ] Bulk operations
- [ ] API for third-party integrations

### Phase 3: Scale & Expand (Q2 2025)
- [ ] USSD access for feature phones
- [ ] Mobile apps (iOS/Android)
- [ ] Multi-country support
- [ ] WhatsApp integration
- [ ] Voice banking

## 🌟 Use Cases

### For SACCOs
- Manage member shares and contributions
- Process loan applications and approvals
- Track savings accounts
- Generate compliance reports
- Member self-service portal

### For MFIs
- Client onboarding with KYC
- Group lending management
- Repayment tracking
- Portfolio risk analysis
- Field officer mobile access

### For Money Lenders
- Quick loan processing
- Collateral management
- Payment reminders
- Default tracking
- Business analytics

## 📄 License

SenteLoans is open source software licensed under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/), [Supabase](https://supabase.com/), and [Tailwind CSS](https://tailwindcss.com/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Inspired by the needs of African financial institutions
- Supported by the open source community

---

**Built with ❤️ for African SACCOs, MFIs, and Financial Cooperatives**

*Empowering financial inclusion through open source technology*

🌍 **Made in Uganda, for Africa**
