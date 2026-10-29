# ClinicFlow Dental — Dental Clinic Management System (DCMS)

ClinicFlow Dental is a modern, full-stack Dental Clinic Management System designed to streamline practice workflows, patient care, staff scheduling, clinical notes, billing, and automated patient communication.

---

## 🚀 Features & Architecture

- **Role-Based Access Control (RBAC)**: Secure multi-tenant authentication and permission enforcement for `Admin`, `Doctor`, `Receptionist`, and `Patient` roles.
- **Smart Appointment Engine**:
  - Interactive master schedule and daily/weekly calendar views.
  - Conflict-free doctor slot booking, rescheduling, and cancellation management.
  - Real-time clinic live board and analytics.
- **Clinical Records & Charting**:
  - Electronic health and dental records with SOAP-compliant consultation notes.
  - Treatment history, diagnosis tracking, and procedure logging.
- **Financial & Billing Ledger**:
  - Itemized invoice generation, payment method recording, and balance tracking.
  - Printable and exportable patient billing statements.
- **Automated Patient Notifications**:
  - Real-time transactional emails via Gmail SMTP for booking confirmations, schedule changes, and cancellations.
  - Automated 24-hour appointment reminder engine with retry-backoff resiliency.
- **AI Practice Assistant**:
  - Integrated Anthropic Claude assistant for clinical workflow queries, policy guidance, and administrative assistance.

---

## 🛠️ Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **ORM & Database**: [SQLAlchemy 2.0 Async](https://www.sqlalchemy.org/) with [Aiosqlite](https://github.com/omnilib/aiosqlite) / PostgreSQL support
- **Data Validation**: [Pydantic v2](https://docs.pydantic.dev/)
- **Authentication**: JWT (JSON Web Tokens) with `passlib` & `bcrypt`
- **Email Dispatcher**: Python standard `smtplib` + TLS (Gmail SMTP)
- **AI Integration**: Anthropic Claude API SDK

### Frontend
- **Framework**: [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Routing**: [React Router DOM v6](https://reactrouter.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Styling**: Vanilla CSS Design System with CSS variables, custom typography, and responsive clinical UI.

---

## 📂 Project Structure

```text
clinicflow-dental/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI routers (auth, appointments, billing, etc.)
│   │   ├── core/            # Config, security, database session setup
│   │   ├── models/          # SQLAlchemy async data models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── services/        # Business logic (email, AI, scheduling)
│   ├── tests/               # Pytest automated test suites
│   ├── seed_data.py         # Clinic demo data seeder
│   ├── requirements.txt     # Python backend dependencies
│   └── .env.example         # Backend environment variable template
├── frontend/
│   ├── src/
│   │   ├── assets/          # Static assets & images
│   │   ├── components/      # Modular UI components & navigation
│   │   ├── context/         # Auth and appointment context providers
│   │   ├── pages/           # Role-based dashboard pages
│   │   └── services/        # Axios API client services
│   ├── package.json         # Frontend dependencies and scripts
│   └── .env.example         # Frontend environment variable template
├── .gitignore               # Root git ignore specification
└── README.md                # Project documentation
```

---

## ⚙️ Local Setup Guide

### Prerequisites
- Python 3.10 or higher
- Node.js (v18+) & npm
- Git

### 1. Backend Setup

Open a PowerShell terminal and navigate to the `backend` directory:

```powershell
cd backend

# Create and activate Python virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
Copy-Item .env.example .env
```

Open `backend/.env` in your editor and configure the variables (see [Environment Variables](#-environment-variables)).

Initialize database tables and seed demo accounts:

```powershell
# Run the database seeder
python seed_data.py

# Start the FastAPI development server
uvicorn app.main:app --reload --port 8000
```
The backend API docs will be accessible at: `http://localhost:8000/docs`

---

### 2. Frontend Setup

In a new terminal window, navigate to the `frontend` directory:

```powershell
cd frontend

# Install npm packages
npm install

# Configure environment variables (optional for default localhost)
Copy-Item .env.example .env

# Start the Vite development server
npm run dev
```

The frontend application will be running at: `http://localhost:5173`

---

## 🔐 Environment Variables

Environment variables are managed using `.env` files (which are ignored by git). Refer to `.env.example` in each directory.

### Backend (`backend/.env`)
- `DATABASE_URL` — Database connection URL (e.g. `sqlite+aiosqlite:///./dental_clinic.db`)
- `SECRET_KEY` — Random cryptographic string for JWT token signing
- `ALGORITHM` — JWT signing algorithm (default: `HS256`)
- `ACCESS_TOKEN_EXPIRE_MINUTES` — Token expiration duration in minutes
- `ANTHROPIC_API_KEY` — Anthropic Claude API key for AI assistant features
- `CLAUDE_MODEL` — Claude model identifier (e.g. `claude-3-7-sonnet-20250219`)
- `GMAIL_USER` — Gmail account address for SMTP transactional emails
- `GMAIL_APP_PASSWORD` — 16-character Google App Password (not your personal password)
- `SMTP_HOST` — SMTP server address (`smtp.gmail.com`)
- `SMTP_PORT` — SMTP TLS port (`587`)
- `SMTP_FROM_NAME` — Display name on outgoing clinic emails

### Frontend (`frontend/.env`)
- `VITE_API_URL` — Base URL of the backend API (e.g. `http://localhost:8000`)

---

## 🧪 Running Automated Tests

The backend includes a comprehensive test suite covering authentication, appointment booking constraints, billing calculations, and RBAC routes:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m pytest tests/ -v
```

---

## 👥 Demo Roles & Accounts

After running `seed_data.py`, the following demo roles are pre-seeded in the system:

| Role | Demo Username | Purpose / Access |
| :--- | :--- | :--- |
| **Admin** | `admin` | Full clinic administrative controls, staff roster, master calendar, billing overview, system audit |
| **Doctor** | `dr_smith` | Daily clinical appointments, patient treatment histories, consultation notes, prescription logs |
| **Receptionist** | `receptionist` | Patient check-ins, booking management, schedule coordination, initial intake |
| **Patient** | `patient1` | Personal appointment booking, upcoming schedule viewing, billing invoices |

*(Note: Passwords for seeded accounts should be set locally during seeding and never committed to source control).*

---

## 📄 License

This project is licensed under the MIT License — see the LICENSE file for details.
