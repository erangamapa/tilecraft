# TileCraft - Deployment Guide

## Prerequisites

1. GitHub account
2. Vercel account (sign up at https://vercel.com)
3. Google Gemini API key

## Step-by-Step Deployment

### 1. Push to GitHub

#### If you haven't initialized git yet:
```bash
git init
git add .
git commit -m "Initial commit: TileCraft - Nano Banana portrait tile generator"
```

#### Create a new repository on GitHub:
1. Go to https://github.com/new
2. Repository name: `tilecraft` (or your preferred name)
3. Set to Public or Private (your choice)
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

#### Push your code:
```bash
# Add your GitHub repository as remote
git remote add origin git@github.com:bitgaming/tilecraft.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 2. Deploy to Vercel

#### Option A: Connect via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard:**
   - Visit https://vercel.com/dashboard
   - Sign in or create an account

2. **Import Project:**
   - Click "Add New..." → "Project"
   - Click "Import Git Repository"
   - Authorize Vercel to access your GitHub account (if not already done)
   - Select your `tilecraft` repository
   - Click "Import"

3. **Configure Project:**
   - **Framework Preset:** Next.js (should auto-detect)
   - **Root Directory:** `./` (default)
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `.next` (default)
   - **Install Command:** `npm install` (default)

4. **Set Environment Variables:**
   - In the "Environment Variables" section, add:
     - **Key:** `GEMINI_API_KEY`
     - **Value:** Your Google Gemini API key
     - **Environment:** Production, Preview, Development (select all)
   - Click "Add"

5. **Deploy:**
   - Click "Deploy"
   - Wait for the build to complete (usually 1-2 minutes)
   - Your app will be live at: `https://tilecraft-xxxxx.vercel.app`

#### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```
   - Follow the prompts
   - When asked for environment variables, add `GEMINI_API_KEY`

4. **Set Environment Variables:**
   ```bash
   vercel env add GEMINI_API_KEY
   ```
   - Enter your API key when prompted
   - Select all environments (Production, Preview, Development)

### 3. Automatic Deployments

Once connected via GitHub:
- **Every push to `main` branch** → Deploys to Production
- **Every pull request** → Creates a Preview deployment
- **Every commit** → Creates a Preview deployment

### 4. Custom Domain (Optional)

1. Go to your project in Vercel dashboard
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

## Environment Variables

### Required:
- `GEMINI_API_KEY` - Your Google Gemini API key

### Where to set:
- **Vercel Dashboard:** Project Settings → Environment Variables
- **Vercel CLI:** `vercel env add GEMINI_API_KEY`

## Troubleshooting

### Build fails:
- Check that `GEMINI_API_KEY` is set in Vercel environment variables
- Check build logs in Vercel dashboard for specific errors

### API route timeout:
- The `vercel.json` file already sets max duration to 60 seconds
- If you need longer, upgrade to Vercel Pro plan

### Images not generating:
- Verify `GEMINI_API_KEY` is correct
- Check API route logs in Vercel dashboard
- Ensure you're using the correct model name (`gemini-3-pro-image-preview`)

## Project Structure

```
tilecraft/
├── app/                    # Next.js app directory
│   ├── api/
│   │   └── generate/      # API route for image generation
│   ├── components/        # React components
│   └── page.tsx           # Main page
├── src/                   # CLI script (optional)
├── vercel.json           # Vercel configuration
├── next.config.js        # Next.js configuration
└── package.json          # Dependencies
```

## Useful Commands

```bash
# Local development
npm run dev

# Build locally
npm run build

# Start production server locally
npm start

# Deploy to Vercel (if using CLI)
vercel

# View deployment logs
vercel logs
```
