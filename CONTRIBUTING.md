# Contributing to SenteLoans

Thank you for your interest in contributing to SenteLoans! This project aims to empower African financial institutions with modern, accessible technology. We welcome contributions from developers, designers, financial experts, and community members.

## 🌍 Project Vision

SenteLoans is an open-source SACCO and MFI management platform designed specifically for the African market, starting with Uganda. Our goal is to digitize financial cooperatives while preserving community values and ensuring accessibility in low-bandwidth environments.

## 🤝 How to Contribute

There are many ways to contribute to SenteLoans:

### 1. Code Contributions
- Bug fixes and patches
- New features and enhancements
- Performance improvements
- Test coverage improvements
- Documentation updates

### 2. Non-Code Contributions
- Documentation improvements
- Translation to African languages (Luganda, Swahili, etc.)
- UI/UX design enhancements
- Reporting bugs and issues
- Suggesting new features
- Reviewing pull requests
- Sharing the project with others

### 3. Domain Expertise
- Financial regulations and compliance guidance
- SACCO operations best practices
- Mobile money integration expertise
- Low-bandwidth optimization strategies

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- A Supabase account (free tier works)
- Git and GitHub account
- Basic knowledge of TypeScript and React

### Setup Development Environment

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/senteloans.git
   cd senteloans
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. **Set up Supabase database**
   ```bash
   # Run the database schema scripts in order
   # scripts/01-create-schema.sql
   # scripts/02-row-level-security.sql
   # See INSTALLATION.md for detailed instructions
   ```

5. **Run the development server**
   ```bash
   pnpm dev
   ```

6. **Visit** `http://localhost:3000`

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## 📝 Development Workflow

### 1. Create a Branch

Create a descriptive branch name:

```bash
git checkout -b feature/add-mobile-money-integration
git checkout -b fix/loan-calculation-bug
git checkout -b docs/update-installation-guide
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

### 2. Make Your Changes

- Write clean, readable code following our style guide
- Add tests for new functionality
- Update documentation as needed
- Follow TypeScript best practices
- Ensure accessibility (WCAG AA compliance)
- Test on mobile devices when relevant

### 3. Commit Your Changes

We follow conventional commit messages:

```bash
git commit -m "feat: add MTN Mobile Money integration"
git commit -m "fix: correct loan interest calculation"
git commit -m "docs: update Supabase setup instructions"
git commit -m "test: add tests for guarantor validation"
```

Commit types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

### 4. Push and Create Pull Request

```bash
git push origin your-branch-name
```

Then create a Pull Request on GitHub with:
- Clear title describing the change
- Detailed description of what and why
- Screenshots for UI changes
- Reference any related issues (#123)
- Check all items in the PR template

## 🎯 Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Properly type all functions and variables
- Avoid `any` type unless absolutely necessary

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use proper TypeScript types for props

### Naming Conventions

- **Files**: `kebab-case.tsx` (e.g., `loan-application-form.tsx`)
- **Components**: `PascalCase` (e.g., `LoanApplicationForm`)
- **Functions**: `camelCase` (e.g., `calculateLoanPayment`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_LOAN_AMOUNT`)

### Code Organization

```typescript
// 1. Imports (grouped)
import { useState } from 'react'
import { Button } from '@/components/ui/button'

// 2. Types/Interfaces
interface LoanFormProps {
  clientId: string
}

// 3. Component
export function LoanForm({ clientId }: LoanFormProps) {
  // 3a. Hooks
  const [amount, setAmount] = useState(0)
  
  // 3b. Event handlers
  const handleSubmit = () => {
    // ...
  }
  
  // 3c. Render
  return (
    // ...
  )
}
```

### Styling

- Use Tailwind CSS utility classes
- Follow mobile-first responsive design
- Maintain consistency with design system
- Ensure dark mode compatibility

## 🧪 Testing Guidelines

- Write tests for all new features
- Maintain or improve test coverage
- Test both success and error cases
- Include edge cases and validation
- Mock external dependencies (Supabase, APIs)

Example test structure:

```typescript
describe('Loan Application', () => {
  it('should validate loan amount', () => {
    // Arrange
    const amount = -1000
    
    // Act
    const result = validateLoanAmount(amount)
    
    // Assert
    expect(result.isValid).toBe(false)
  })
})
```

## 🌐 Localization

When adding user-facing text:

- Use clear, simple language
- Consider translation to Luganda and other African languages
- Avoid idioms or culturally-specific references
- Use proper formatting for currencies (UGX) and dates

## 📋 Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass (`pnpm test`)
- [ ] New tests added for new functionality
- [ ] Documentation updated if needed
- [ ] No console errors or warnings
- [ ] Tested on mobile devices (for UI changes)
- [ ] Accessibility requirements met
- [ ] Commit messages follow conventional format
- [ ] Branch is up to date with main

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Clear title** - Descriptive summary of the issue
2. **Steps to reproduce** - Detailed steps to recreate the bug
3. **Expected behavior** - What should happen
4. **Actual behavior** - What actually happens
5. **Screenshots** - If applicable
6. **Environment**:
   - OS and version
   - Browser and version
   - Node.js version
   - Device type (desktop/mobile)
7. **Additional context** - Any other relevant information

## 💡 Suggesting Features

We welcome feature suggestions! Please provide:

1. **Clear description** - What feature you'd like to see
2. **Use case** - Why this feature would be valuable
3. **User story** - "As a [user type], I want to [action] so that [benefit]"
4. **African market context** - How this addresses African market needs
5. **Implementation ideas** - Any technical suggestions (optional)

## 🔍 Code Review Process

All submissions require review. We aim to:

- Respond to PRs within 48 hours
- Provide constructive feedback
- Maintain high code quality
- Foster learning and collaboration

Reviewers will check for:
- Code quality and style
- Test coverage
- Documentation
- Performance implications
- Security considerations
- Accessibility compliance

## 🏆 Recognition

Contributors will be:
- Listed in our README
- Credited in release notes
- Acknowledged in the community

## 📞 Getting Help

- **GitHub Discussions**: Ask questions and discuss ideas
- **GitHub Issues**: Report bugs and track feature requests
- **Documentation**: Check existing docs first

## 🌟 African Market Context

When contributing, please consider:

- **Low bandwidth**: Optimize images, lazy load content, minimize bundle size
- **Mobile-first**: Most users access via mobile devices
- **Offline capability**: Consider progressive web app features
- **Local currencies**: Support UGX and other African currencies
- **Regulatory compliance**: Be aware of Ugandan financial regulations
- **Cultural sensitivity**: Respect local customs and practices
- **Language support**: English and Luganda initially, expandable

## 📄 License

By contributing to SenteLoans, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

Feel free to open a GitHub Discussion or reach out to the maintainers. We're here to help!

**Thank you for contributing to SenteLoans and empowering African financial institutions! 🇺🇬**
