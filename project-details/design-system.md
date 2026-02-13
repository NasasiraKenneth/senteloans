## **Core Brand Identity**

This design system provides a cohesive, professional, and accessible foundation for the Sente Loan financial management platform, ensuring consistency across all user interfaces while maintaining the trust and reliability expected in financial applications.

### **Primary Colors**

- **Navy Blue**: `#1A2F5B` (Primary brand color) - Used for headers, primary actions, and key UI elements
- **Warm Orange**: `#F08C2B` (Accent color) - Used for secondary actions, highlights, and interactive elements
- **Charcoal Gray**: `#4A4A4A` - Primary text color and foreground elements
- **Light Gray**: `#F5F5F5` - Background surfaces and muted elements


### **Semantic Color Palette**

- **Success**: `#28A745` (Green) - Success states, positive actions
- **Warning**: `#FFC107` (Yellow) - Warning states, caution indicators
- **Error**: `#DC3545` (Red) - Error states, destructive actions
- **Info**: Navy Blue `#1A2F5B` - Information states, neutral highlights


## **Typography System**

**Primary Font**: Inter (Google Fonts)
**Fallback**: ui-sans-serif, system-ui, sans-serif

### **Type Scale**

- **H1**: `text-4xl md:text-5xl font-bold` - Main page titles
- **H2**: `text-2xl md:text-3xl font-semibold` - Section headers
- **H3**: `text-lg md:text-xl font-medium` - Subsection titles
- **Body**: `text-base leading-relaxed` - Regular content
- **Small**: `text-sm text-muted-foreground` - Supporting text
- **Links**: `text-accent font-medium hover:underline` - Interactive text


## **Component Design Patterns**

### **Buttons**

- **Primary**: Navy blue background, white text, subtle shadow
- **Secondary**: Light gray background, charcoal text
- **Accent**: Warm orange background, white text
- **Outline**: Border with navy blue, transparent background
- **Ghost**: Transparent with hover states
- **Link**: Accent color with underline on hover


### **Form Elements**

- **Border Radius**: `rounded-lg` (8px) for consistency
- **Focus States**: Navy blue ring with 2px width
- **Error States**: Red border and ring indicators
- **Input Height**: `h-10` (40px) standard
- **Placeholder**: Muted foreground color


### **Cards & Containers**

- **Border Radius**: `rounded-xl` (12px) for modern appearance
- **Background**: White with defined outline
- **Outline (Standard)**: Use a clear outline with no elevation: `shadow-none ring-1 ring-border` (or `border border-border/70`).
- **Shadows**: Avoid shadows on form surfaces and data cards (flat-outline design). Use elevation sparingly only for popovers/menus.
- **Padding**: Consistent `px-6 py-6` spacing


## **Layout & Spacing**

### **Grid System**

- **Responsive Breakpoints**: Mobile-first approach
- **Container Max-widths**: Tailwind's standard breakpoints
- **Gap Spacing**: Consistent use of Tailwind's spacing scale

### **Form Layout & Grouping**

- **Flat-Outline Forms**: Prefer flat-outline inputs and containers; no card shadows.
- **Sectional Grouping**: Group related controls under a section header with an icon and short description.
- **Dividers**: Add a visible divider below each section header using `divide-y` on section containers or `border-b`.
- **Grid**: Use `grid gap-6 md:grid-cols-2` for two-column layouts; stack on mobile.
- **Controls**: Inputs/selects are `rounded-lg`, `h-10`, neutral borders; focus uses primary ring.


### **Spacing Scale**

- **Micro**: `gap-1.5` (6px) - Tight element spacing
- **Small**: `gap-4` (16px) - Standard component spacing
- **Medium**: `gap-6` (24px) - Section spacing
- **Large**: `gap-8` (32px) - Major section breaks


## **Dark Mode Support**

Complete dark mode implementation with:

- **Background**: `#111827` (Dark gray)
- **Foreground**: `#f9fafb` (Light gray)
- **Adjusted Brand Colors**: Lighter variants for better contrast
- **Semantic Colors**: Optimized for dark backgrounds
- **Component Theming**: All UI elements adapt automatically


## **Technical Implementation**

### **CSS Architecture**

- **CSS Variables**: All design tokens as custom properties
- **OKLCH Color Space**: Perceptually uniform color definitions
- **Tailwind CSS v4**: Modern utility-first framework
- **Component Variants**: Type-safe styling with CVA


### **Accessibility Features**

- **Focus Management**: Visible ring indicators on all interactive elements
- **Color Contrast**: WCAG AA compliant ratios
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Screen Reader Support**: Appropriate ARIA labels and descriptions


### **Development Tools**

- **Class Variance Authority**: Type-safe component variants
- **Tailwind Merge**: Intelligent class conflict resolution
- **Next Themes**: Seamless dark/light mode switching
- **Shadcn/ui**: High-quality component foundation

## **Loading States**

### **When to Use Skeletons vs Spinners**

- **Skeletons (preferred for pages)**
  - Use for content- or data-heavy views where the final layout is known (lists, grids, detail pages, dashboards, edit forms).
  - Benefits: reduces perceived wait time, prevents layout shift, preserves visual structure.
  - Examples: `/admin`, `/admin/institutions`, `/admin/institutions/[id]`, `/admin/institutions/[id]/edit`.

- **Spinners (preferred for small actions)**
  - Use for short, indeterminate operations without a predictable layout.
  - Button-level or inline operations (e.g., Save, Delete), not full-page data loads.

### **Skeleton Design Guidelines**

- **Shape & Layout**: Match the final UI’s structure (titles, badges, rows, cards, buttons). Keep count proportional to expected items.
- **Animation**: Subtle shimmer. Respect reduced motion preferences (`prefers-reduced-motion`) by disabling shimmer and using static placeholders.
- **Color**: Use muted foreground on neutral backgrounds. Ensure dark mode parity.
- **Spacing**: Maintain the same padding, gaps, and grid as the real content to avoid jarring shifts.
- **Components**: Reuse `Skeleton` component with heights/widths that mirror target components (`h-10` for inputs/buttons, etc.).

### **Accessibility**

- **Announce Busy**: Mark the container as busy while loading (e.g., `aria-busy="true"`).
- **Presentation**: Skeletons should be presentational only. Avoid focus traps and do not announce placeholders as real content.
- **Focus Management**: Do not move focus to skeletons. Keep focus on stable UI or set it after content loads, if appropriate.

### **Patterns & Examples**

- **Header Skeleton**: Title + subtitle bars.
- **Grid/List Skeletons**: Repeat card or row placeholders (3–6 items typical for first paint).
- **Form Skeletons**: Labels (optional) and input/button bars in the same grid.
- **Dashboard**: Stat cards (title + number), recent list blocks, and secondary cards.

### **Implementation Checklist**

- Use route-level `loading.tsx` for page-first loads (Next.js App Router convention).
- Provide an in-component loading state fallback while client-side data fetching occurs.
- Maintain consistent skeletons across routes for a cohesive experience.

## **Form Validation**

### **Goals**

- Ensure data quality before submission.
- Provide clear, inline feedback to users without disrupting flow.
- Maintain accessibility and consistency across all forms.

### **Validation Timing**

- **On Submit**: Always validate all required fields and block submission if invalid.
- **On Blur**: Validate a field after the first blur (first interaction), then on change to clear errors as the user corrects input.
- **During Submit**: Disable the primary action and set `aria-busy="true"` on the form container.

### **Required Fields & Patterns**

- **Required**: Mark with `*` in the label and validate presence.
- **Email**: Basic RFC-style regex (e.g., `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).
- **Phone**: Allow `+countrycode` and digits; avoid over-restricting formats.
- **Select/Type choices**: Ensure a non-empty selection is made when required.
- **Address/Names**: Must be non-empty; trim whitespace before validating.

### **Error Display & States**

- **Inline Errors**: Place a small error message under the field using `text-red-600 text-xs`.
- **Invalid State**: Set `aria-invalid="true"` on invalid inputs. Optionally set `aria-describedby` to the error element id.
- **Clearing**: Remove the error as soon as the field becomes valid.

### **Buttons & Form State**

- **Disable on Submit**: Disable the submit button and show an inline spinner/text like “Saving...” while submitting.
- **No Double Submit**: Guard against multiple rapid submissions.

### **Accessibility**

- **Focus**: Do not move focus away from the current field when errors occur.
- **Error Summary (optional)**: For long forms, display a summary banner linking to invalid fields; keep inline messages regardless.
- **ARIA**: Use `role="status"` for submission feedback where appropriate.

### **Consistency & Reuse**

- **Helpers**: Prefer small shared helpers like `validateEmail(value)`, `isRequired(value)`, and light phone checks in a `lib/validation.ts`.
- **Patterns**: Apply the same validation approach in Admin Login, New Institution, Edit Institution, and Add Admin User forms.

### **Example (Email Field)**

\`\`\`tsx
<Label htmlFor="email">Email *</Label>
<Input
  id="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  onBlur={validateEmailOnBlur}
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? "email-error" : undefined}
/>
{errors.email && (
  <p id="email-error" className="text-xs text-red-600">{errors.email}</p>
)}
