<h1 align="center">PayIT - The Agentic Smart Finance App for Africa</h1>

<p align="center">
  <strong>Seamlessly bridging everyday Web2 financial operations with Web3 Stablecoin infrastructure, all within a Telegram-Native AI Agent.</strong>
</p>

---

## 🌍 The Product Vision: Finance Without Friction

In emerging markets, particularly across Africa, individuals and SMEs constantly battle currency devaluation, extreme cross-border payment friction, and severely fragmented financial tools. While Web3 stablecoins solve the core issues—preserving wealth and enabling instant global liquidity—the **User Experience (UX) is completely broken**. 

Asking an SME owner or an everyday consumer to download a complex crypto wallet, back up a 12-word seed phrase, purchase native gas tokens (like ETH), and understand hexadecimal addresses is an absolute non-starter.

**PayIT** solves this by entirely abstracting the blockchain. Built natively into Telegram—an app that millions already use daily—PayIT operates as a context-aware, dual-account (Personal + Business) financial assistant. It feels like chatting with a highly competent accountant.

Under the hood, PayIT holds your funds in **Stablecoins (USDC/USDT)** on Arbitrum Sepolia, completely immune to local inflation. However, on the surface, it generates **Virtual Fiat Bank Accounts** for your customers, allowing you to operate your business exactly as you do today, but with superpower infrastructure.

### 🚀 How PayIT Works (Step-by-Step for the End User)

We have removed every single point of friction to create a magically intuitive experience:

1. **Zero-Friction Onboarding**
   - You open the `@payiitbot` on Telegram and type `/start`. That's it. You instantly have a fully secure account. No seed phrases, no complex passwords, no downloads.
   - The bot introduces you to your **Personal** and **Business** profiles. You easily switch between them using the built-in keyboard.

2. **Receiving Money (Privacy-First)**
   - When you want to receive money, you tap **"Receive Money"**. You can choose to receive local Fiat (e.g., NGN, USD) or Crypto.
   - **If Fiat:** PayIT generates a unique Virtual Bank Account just for that transaction. The sender pays via a standard local bank transfer.
   - **If Crypto:** PayIT dynamically generates a single-use receiving address. Your main account address remains completely private.
   - As soon as the exact funds are received, the bot automatically secures them into your main vault. If they underpay, the bot halts and asks for your manual approval.

3. **Smart Invoicing & Accounting**
   - As a business owner, you can generate an invoice in seconds. You input the amount, and PayIT generates a beautifully rendered visual receipt directly in the chat.
   - When your customer pays, the system automatically detects it and marks the invoice as paid. No manual reconciliation needed!
   - At the end of the month, you simply tap **"📈 Business Data Export"**. PayIT instantly replies with a professionally formatted `.xlsx` Excel workbook detailing your income, expenditures, net profit, and estimated tax liabilities.

4. **Chat to Transact (Agentic AI)**
   - Tired of clicking buttons? Just type: *"Send 500 USDC to Ada"* or upload a picture of a receipt and say *"Pay this vendor"*. 
   - PayIT's built-in AI understands your intent, parses the data, and securely executes the financial transfer for you.
   - If you ever get stuck, tap the **AI Support** button. A deeply integrated AI assistant (powered by Groq) knows exactly how the platform works and guides you through any issue in real-time.

5. **Auto-Save & Yield**
   - You can configure your business account to automatically lock away 5% of every incoming invoice into a high-yield savings vault. PayIT puts your money to work securely, earning up to 10% APY while you sleep.

---

## 🏗️ Technical Architecture & Infrastructure 

To deliver this magical "Web2 feel," PayIT heavily leverages the bleeding edge of **Account Abstraction (ERC-4337)**, **Intent-Based Architectures**, and **Agentic AI**.

### 1. Particle Network (Universal Accounts & Smart Wallets)
- **The Core Engine:** We use Particle Network's Universal Accounts to provision EVM-compatible Smart Accounts natively bound to a user's Telegram ID via Social Login mechanics.
- **Gasless Transactions:** Through Particle Network's robust Paymasters, all transaction fees (gas) are heavily sponsored. The user interacts exclusively with Stablecoins; they never have to think about or acquire native gas tokens (ETH).
- **Temporary HD Wallets:** To ensure 100% accurate invoice reconciliation and user privacy, we generate single-use Hierarchical Deterministic (HD) wallets for incoming payments. When the exact payment is detected on the temporary wallet, the Particle Paymaster sponsors the transaction to instantly "sweep" the funds into the user's primary Universal Account contract.

### 2. ZeroDev & Openfort (Advanced Account Abstraction)
- **Session Keys:** We utilize Session Key modules to allow the PayIT background agent to perform specific, tightly-scoped recurring tasks (like automated payroll sweeps or the Auto-Save yield feature) without requiring the user to physically sign every time.
- **Treasury Management Rules:** The underlying smart contracts implement complex back-office policies, such as automated treasury routing—sweeping a percentage of incoming payments automatically to a segregated "Tax Reserve" wallet.

### 3. Groq & Llama (Agentic NLP Parsing)
- **Intent Execution:** Instead of rigid UI forms, the bot utilizes the blazing-fast Groq API running Llama models. When a user sends unstructured data (e.g., "Save 500 USDC for 30 days" or uploads an image), the LLM parses the intent, categorizes the action, and outputs structured JSON payloads (`{ action: 'SAVINGS_LOCK', amount: 500, duration: 30 }`). 
- **Contextual Support:** We feed the LLM a highly detailed system prompt about PayIT's internal mechanics, allowing the AI to act as a Tier-1 customer support agent that answers user queries dynamically.

### 4. Magic.link
- **Secure Fallback & Verification:** While Telegram handles the primary UX, Magic.link is integrated for deep-link authentication. For sensitive actions like exporting the underlying private key, we use Magic to provide a secure, passwordless email verification flow natively inside the chat interface.

### 5. Node.js & SQLite Backend
- **Orchestration:** A robust Node.js backend orchestrates the webhooks, Telegram polling, Excel generation (`exceljs`), and SVG-to-Image receipt generation (`sharp`). It maintains a local SQLite database to manage the dual-context states, ledger history, and mapping of temporary HD wallets to Universal Accounts.

---

## 🛠️ Step-by-Step Developer Setup (Forking & Building)

Want to run PayIT locally or deploy your own version? Follow these steps.

### Prerequisites
- Node.js (v18+)
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- API Keys from Particle Network, ZeroDev, Openfort, Groq, and Magic.link.

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/IgbozeIsrael/payit-particle.git
cd payit-particle/payit-particle
\`\`\`

### 2. Install Dependencies
\`\`\`bash
npm install
\`\`\`

### 3. Configure Environment Variables
Create a \`.env\` file in the \`payit-particle\` root directory. You will need to supply the following variables:

\`\`\`env
# Telegram
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_USE_WEBHOOK="false"

# AI
GROQ_API_KEY="your_groq_api_key"

# Infrastructure
PARTICLE_PROJECT_ID="your_particle_project_id"
PARTICLE_CLIENT_KEY="your_particle_client_key"
PARTICLE_APP_ID="your_particle_app_id"
PARTICLE_SERVER_KEY="your_particle_server_key"

ZERODEV_PROJECT_ID="your_zerodev_project_id"
ZERODEV_PAYMASTER_URL="your_zerodev_paymaster_url"

OPENFORT_SECRET_KEY="your_openfort_secret_key"
OPENFORT_PUBLIC_KEY="your_openfort_public_key"

MAGIC_SECRET_KEY="your_magic_secret_key"
MAGIC_PUBLISHABLE_KEY="your_magic_publishable_key"
\`\`\`

### 4. Run the Bot
\`\`\`bash
npm run telegram
\`\`\`
The bot will initialize the SQLite database locally (`payit.db`) and start polling for messages. 

### 5. Testing
1. Open Telegram and search for your bot.
2. Tap **Start**.
3. Use the Root Menu to navigate between the **Personal** and **Business** accounts.
4. Try creating an invoice under the Business Invoice Hub to see the SVG-renderer generate a dual Web3/Fiat payment receipt.
5. Generate an address via **Receive Money** and simulate an auto-sweep using `/simulate_payment <address> <amount>`.
6. Try clicking "Business Data Export" to see the `exceljs` module generate a clean `.xlsx` ledger.
