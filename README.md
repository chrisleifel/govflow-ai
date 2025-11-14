# Govli AI

**Government Workflow & Security Platform**

Govli AI is a comprehensive government workflow and security platform designed to streamline public sector operations with cutting-edge AI capabilities, secure data management, and compliance with federal standards.

## 🌊 Overview

Govli AI (formerly GovFlow AI) provides an integrated suite of tools for government agencies to manage workflows, process documents, track permits, ensure security compliance, and deliver better citizen services.

### Key Features

- **Permit Management** - Admin and citizen portals for permit applications and tracking
- **Document Intelligence** - AI-powered document processing and analysis
- **Workflow Orchestration** - Visual workflow builder and automation engine
- **Security & Compliance** - CJIS, FedRAMP, and FISMA compliance tools
- **Advanced Analytics** - Predictive analytics and real-time insights
- **Blockchain Audit Trail** - Immutable record-keeping for transparency
- **API Integration Platform** - Connect with existing government systems
- **Training Curriculum** - Built-in training system for staff onboarding

## 🎨 Design System

Govli AI uses a professional **Blue Ocean** aesthetic featuring:

- **Glassmorphism** UI with backdrop blur effects
- **Deep ocean gradient** background (#0a1628 to #164e7f)
- **Accessible design** meeting WCAG 2.1 AA standards
- **Responsive layout** optimized for desktop and mobile
- **Tailwind CSS** framework for consistent styling

### Color Palette

- Primary Blue: `#1e40af`
- Secondary Blue: `#3b82f6`
- Cyan Accent: `#06b6d4`
- Purple: `#8b5cf6`
- Green: `#10b981`
- Yellow: `#f59e0b`
- Red: `#ef4444`

## 📁 Project Structure

```
govli-ai/
├── index.html                          # Main application entry point
├── RULES.md                            # Development guidelines and standards
│
├── Portals/
│   ├── admin-permits-portal.html       # Administrative permit management
│   ├── citizen-permits-portal.html     # Citizen-facing permit portal
│   └── citizen-permits-login.html      # Authentication for citizens
│
├── Core Features/
│   ├── workflow-orchestration-test.html       # Workflow automation engine
│   ├── workflow-builder-test.html             # Visual workflow designer
│   ├── workflow-canvas-test.html              # Workflow canvas interface
│   ├── advanced-analytics-test.html           # Analytics dashboard
│   ├── platform-intelligence-hub-test.html    # Central intelligence hub
│   └── autonomous-operations-test.html        # Self-managing operations
│
├── Document Processing/
│   ├── document-intelligence-test.html        # AI document analysis
│   ├── intelligent-document-processing-test.html
│   ├── document-processing-admin-test.html
│   └── enhanced-document-intelligence-crm-test.html
│
├── Security & Compliance/
│   ├── advanced-security-operations-center-test.html
│   ├── cjis-integration-hub-test.html         # Criminal Justice IS
│   ├── cjis-security-config-test.html
│   ├── blockchain-audit-trail-test.html       # Immutable records
│   ├── quantum-security-test.html             # Future-proof encryption
│   └── securemesh-test.html                   # Network security
│
├── Intelligence & Analytics/
│   ├── predictive-analytics-test.html
│   ├── predictive-needs-test.html
│   ├── policy-intelligence-test.html
│   ├── policy-interpreter-test.html
│   └── regulation-assistant-test.html
│
├── Integration & APIs/
│   ├── api-integration-platform-test.html
│   ├── constituent-inbox-test.html
│   ├── intelligent-contact-import-test.html
│   └── public-engagement-test.html
│
├── Specialized Tools/
│   ├── department-process-center-test.html
│   ├── digital-twin-test.html
│   ├── mobile-command-center-test.html
│   ├── training-curriculum.html
│   ├── app-switcher-test.html
│   └── permits-landing-test.html
│
└── Themes/
    └── professional-blue-ocean-theme-test.html
```

## 🚀 Getting Started

### Prerequisites

**Option 1: Docker (Recommended)**
- Docker 20.10+
- Docker Compose 1.29+

**Option 2: Manual Setup**
- A modern web browser (Chrome, Firefox, Safari, Edge)
- A local web server (optional, for development)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd govli-ai
```

2. Open in browser:
```bash
# Option 1: Direct file opening
open index.html

# Option 2: Using Python's built-in server
python3 -m http.server 8000

# Option 3: Using Node.js http-server
npx http-server -p 8000
```

3. Navigate to `http://localhost:8000` (if using a local server)

### 🐳 Docker Deployment (Recommended)

The easiest way to run Govli AI is using Docker:

```bash
# Build and start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down
```

The application will be available at `http://localhost:8080`

**Docker Features:**
- Lightweight nginx:alpine base image
- Security headers configured (X-Frame-Options, X-XSS-Protection, etc.)
- Health checks enabled
- Production-ready caching strategy
- Automatic restart on failure

**Manual Docker Build:**
```bash
# Build the image
docker build -t govli-ai:latest .

# Run the container
docker run -d -p 8080:80 --name govli-ai govli-ai:latest

# Check health status
docker ps
```

### Quick Start

1. **Main Dashboard**: Open `index.html` to access the main application
2. **Admin Portal**: Navigate to `admin-permits-portal.html` for administrative functions
3. **Citizen Portal**: Use `citizen-permits-portal.html` for public-facing services
4. **Training**: Access `training-curriculum.html` to onboard new users

## 🛠️ Development

### Development Guidelines

See [RULES.md](RULES.md) for comprehensive development rules including:

- Git workflow and safety protocols
- Design system specifications
- Accessibility requirements (A11Y)
- Security best practices
- Performance optimization
- Testing requirements

### Key Development Rules

1. **Always create a git branch** before adding features
2. **Never modify index.html** without testing in isolation first
3. **Preserve existing features** - only add, never remove
4. **Use real government data** standards (FBI, EPA, IRS)
5. **Include compliance badges** (CJIS, FedRAMP, FISMA)
6. **Maintain accessibility** (WCAG 2.1 AA minimum)
7. **Mark integration points** clearly in code comments

### Building New Features

1. Create a new git branch
2. Build feature in a separate test file
3. Apply Blue Ocean design system
4. Test on desktop and mobile
5. Add loading, error, and empty states
6. Verify keyboard navigation
7. Mark mock data and API integration points
8. Test that existing features still work
9. Integrate into main application

## 🔒 Security & Compliance

Govli AI is designed to meet government security standards:

- **CJIS Compliant** - Criminal Justice Information Services
- **FedRAMP Ready** - Federal Risk and Authorization Management Program
- **FISMA Compatible** - Federal Information Security Management Act
- **ISO 8601** - Standardized date/time formats
- **Blockchain Audit Trail** - Immutable transaction records
- **Quantum-Resistant Security** - Future-proof encryption

### Security Best Practices

- No inline JavaScript event handlers
- Input validation on all user data
- No localStorage for sensitive information
- Proper error handling without exposing system details
- Security TODOs clearly marked in code

## 📱 Features Overview

### Workflow Management
- Visual workflow builder with drag-and-drop interface
- Workflow orchestration engine
- Department process automation
- Document processing workflows

### Document Intelligence
- AI-powered document analysis
- Automated data extraction
- Multi-format support (PDF, images, forms)
- Integration with CRM systems

### Analytics & Insights
- Real-time dashboards
- Predictive analytics
- Policy intelligence
- Performance metrics

### Security Operations
- Security Operations Center (SOC)
- CJIS integration hub
- Blockchain audit trails
- Quantum security protocols
- SecureMesh network protection

### Citizen Services
- Public permit applications
- Status tracking
- Document uploads
- Secure authentication
- Mobile-responsive interface

## 🧪 Testing

Each feature module includes test pages (suffixed with `-test.html`). To test a feature:

1. Open the test HTML file directly
2. Verify all functionality works in isolation
3. Test on multiple screen sizes
4. Check keyboard navigation (Tab, Enter, Escape)
5. Verify error states and loading indicators
6. Ensure no console errors appear

## 📊 Technology Stack

### Frontend
- **HTML5** - Semantic markup
- **Tailwind CSS** - Utility-first CSS framework
- **Font Awesome 6** - Icon library
- **QR Code.js** - QR code generation
- **Vanilla JavaScript** - No framework dependencies
- **CSS3** - Modern styling with glassmorphism

### Infrastructure
- **Docker** - Containerization
- **nginx:alpine** - Web server (lightweight)
- **Docker Compose** - Multi-container orchestration

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Follow guidelines in [RULES.md](RULES.md)
3. Test thoroughly on desktop and mobile
4. Ensure accessibility compliance
5. Mark all mock data and integration points
6. Commit with clear, descriptive messages
7. Create a pull request

## 📄 License

[Add your license information here]

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 📞 Support

For issues, questions, or feature requests, please [create an issue](../../issues) in the repository.

## 🗺️ Roadmap

- [ ] Backend API integration
- [ ] Real-time collaboration features
- [ ] Advanced AI capabilities
- [ ] Mobile native applications
- [ ] Multi-language support
- [ ] Enhanced accessibility features
- [ ] Additional third-party integrations

---

**Govli AI** - Empowering government with intelligent automation and secure workflows.
