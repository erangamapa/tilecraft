# TileCraft

Tool that generates stunning portrait game tiles from casino game provider assets using Nano Banana and Canvas.

<!-- Build trigger -->

## Features

- Password protection for secure access
- Wizard-based UI with 4 steps
- Use default example images or upload custom ones
- Upload input asset and enter game name
- Generate portrait tiles (250x328px) using Gemini image models
- Download generated images

## How to Run the Project

Follow these steps to get the project running locally:

### 1. Checkout the Repository

Clone or checkout the repository to your local machine:

```bash
git clone <repository-url>
cd casino-portrait-gen
```

Or if you already have the repository:

```bash
cd casino-portrait-gen
git pull
```

### 2. Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install all dependencies including Next.js, Google Generative AI SDK, Sharp, Canvas, and other required packages.

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory of the project:

```bash
touch .env.local
```

Add the following environment variables to `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
SITE_PASSWORD=your_password_here
```

**Getting your Gemini API Key:**
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key" or select an existing project
4. Copy the generated API key
5. Paste it as the value for `GEMINI_API_KEY` in your `.env.local` file

For detailed instructions, see the [Google AI for Developers documentation](https://ai.google.dev/gemini-api/docs/api-key).

**Note:** The `SITE_PASSWORD` is optional. If not set, it defaults to `tilecraft2024`.

### 4. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

The server will start and you should see output similar to:

```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - Ready in Xs
```

### 5. Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

You'll be redirected to the login page. Enter the password you set in `SITE_PASSWORD` (or use `tilecraft2024` if you didn't set one).

After logging in, you can:
- Upload example images or use the default ones
- Upload your input asset (landscape casino game tile)
- Enter the game name and optional studio name
- Generate portrait tiles and download them

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:

   **For local development**, create a `.env.local` file in the root directory:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   SITE_PASSWORD=your_password_here
   ```

   **Required Environment Variables:**
   - `GEMINI_API_KEY` - Your Google Gemini API key (required)
     - Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
     - Documentation: [Google AI for Developers - Get API Key](https://ai.google.dev/gemini-api/docs/api-key)
     - Sign in with your Google account and create a new API key
   - `SITE_PASSWORD` - Password to protect your site (optional, defaults to `tilecraft2024`)
   - `GEMINI_IMAGE_MODEL` - Image generation model (optional, defaults to `gemini-3-pro-image-preview`)
     - `gemini-3-pro-image-preview` - Latest preview model (default). Requires [billing](https://ai.google.dev/gemini-api/docs/billing) (free tier has 0 quota).
     - `gemini-2.5-flash-image` - Has free tier quota (~500 RPD). Use this if you hit "quota exceeded" on the default.

   **For Vercel deployment**, add these environment variables in your Vercel project settings:
   - `GEMINI_API_KEY` - Your Google Gemini API key
   - `SITE_PASSWORD` - Password to protect your site (optional, defaults to `tilecraft2024` if not set)
   - `GEMINI_IMAGE_MODEL` - Image model (optional; default `gemini-3-pro-image-preview`)

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

Deploy to Vercel:

```bash
vercel
```

Make sure to set these environment variables in Vercel dashboard:
- `GEMINI_API_KEY` - Your Google Gemini API key
- `SITE_PASSWORD` - Password to protect your site (optional, defaults to `tilecraft2024`)

## Password Protection

The site is protected by password authentication. Users will be redirected to a login page when accessing the site. After entering the correct password, they'll be authenticated for 30 days via a secure cookie.

To change the password, update the `SITE_PASSWORD` environment variable in Vercel and redeploy.

## How It Works

### AI Image Cleaning and Resizing

The application uses Google's Gemini 3 Pro Image Preview model to transform landscape casino game tiles into portrait format (250x328px). The AI performs several key operations:

1. **Aspect Ratio Conversion**: Converts landscape images to a 2:3 portrait aspect ratio by extending the canvas downward
2. **Text Removal**: Completely removes all existing text, logos, badges, studio names, and UI elements from the original image
3. **Content Preservation**: Ensures all characters, figures, and objects are fully visible within the frame with no cutoff
4. **Background Extension**: The lower 40% of the image is extended with clean, typography-safe backgrounds using smooth gradients, mist, or natural scene elements
5. **Final Resizing**: The generated image is resized to exact dimensions (250x328px) using Sharp image processing library

The AI prompt specifically instructs the model to:
- Preserve all visual elements in the upper 60% of the image
- Remove all branding and text elements seamlessly
- Create a clean lower area suitable for text overlay
- Maintain natural lighting and visual continuity

### HTML5 Canvas Text Overlay - Game Name

The game name is rendered using HTML5 Canvas with sophisticated text layout algorithms:

**Two-Line Constraint:**
- The game name is **always forced into exactly 2 lines**, regardless of length
- Words are intelligently distributed across the two lines to balance width
- The algorithm tries all possible split points to find the most balanced distribution
- If a single word is too long, the font size is reduced until it fits

**Dynamic Font Size Adjustment:**
- Initial font size is calculated as 48% of the text area height (~52px)
- The font size automatically reduces based on the game name length
- Minimum font size is 50% of the initial size (~26px) to ensure readability
- The algorithm iteratively reduces font size by 1px until the text fits in exactly 2 lines
- Uses the "Midnight Sans" font family (bold weight) for the game name

**Text Positioning:**
- Text area occupies the bottom 33% of the image (108px height)
- Horizontal padding of 15% (~37px) on each side
- Vertical padding of 10% (~11px) top and bottom
- Text is center-aligned and positioned above the studio name (if present)
- Line height is set to 1.1x the font size for optimal spacing

**Implementation Details:**
- Uses Node.js `canvas` library for server-side rendering
- Text is rendered on a transparent overlay canvas
- The overlay is composited onto the image using Sharp's composite function
- Font is registered from the local `fonts/midnight-sans-st-48-heavy-pro.ttf` file

### Studio Name Placement

The studio name is rendered below the game name using a different approach:

**Font and Styling:**
- Uses the "Inter" font family (regular weight) at 28% of the game name font size (~15px)
- Positioned at the bottom of the image with vertical padding
- Text is converted to uppercase for consistency

**Multi-Line Support:**
- Studio name can wrap to multiple lines if needed (unlike game name which is fixed to 2 lines)
- Uses a greedy word-wrapping algorithm that fits as many words as possible per line
- Line height is 1.1x the font size

**Positioning:**
- Positioned 8px below the game name when both are present
- If no studio name is provided, the game name moves closer to the bottom
- Always aligned to the center horizontally
- Uses `textBaseline: 'bottom'` for precise vertical positioning

**Implementation:**
- Same canvas overlay system as the game name
- Font registered from `fonts/Inter-Regular.ttf`
- Rendered before compositing the final image

## Project Structure

- `app/` - Next.js app directory
  - `page.tsx` - Main wizard component
  - `components/` - Wizard step components
  - `api/generate/route.ts` - API route for image generation

## License

ISC
