# AI Image Fusion Studio

An advanced web application for seamlessly matting subjects from images and fusing them with AI-generated backgrounds, built with Next.js, Stability AI, and Supabase.

## Key Features

- **AI-Powered Matting**: Automatically removes the background from any uploaded image using the Stability AI API.
- **Custom Aspect Ratios**: Choose from popular aspect ratios (`9:16`, `1:1`, `3:4`, `16:9`) to control the dimensions of the final image.
- **Generative Backgrounds**: Dynamically generate high-quality backgrounds using Stability AI (SD3) based on text prompts and the selected aspect ratio.
- **Seamless Image Fusion**: Intelligently composites the subject onto the new background, preserving scale and centering.
- **Cloud Storage**: All generated images (matted subjects, backgrounds, final compositions) are stored and served via Supabase Storage.
- **Modern Tech Stack**: Built with Next.js 14 App Router, styled with Tailwind CSS, and deployed with ease.

## Technology Stack

- **Framework**: [Next.js](https://nextjs.org/) 14
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend Image Processing**: [Sharp](https://sharp.pixelplumbing.com/)
- **Database & Storage**: [Supabase](https://supabase.com/)
- **AI Services**: [Stability AI API](https://platform.stability.ai/)
  - *Image Matting*: `v2/stable-image/edit/remove-background`
  - *Background Generation*: `v2beta/stable-image/generate/sd3`

## Getting Started

Follow these steps to get the project running locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/sourit2001/AIbg.git
    cd AIbg
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a new file named `.env.local` in the root of your project and add the following variables. You can get these keys from your Supabase and Stability AI dashboards.
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_project_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_project_service_role_key
    STABILITY_API_KEY=your_stability_ai_api_key
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## API Endpoints

The application uses the following server-side API routes:

- `POST /api/matting`: Handles the initial image upload and sends it to Stability AI for background removal.
- `POST /api/ai-fuse`: A multi-purpose endpoint with two main `action` types:
  - `generate-background`: Takes a prompt and aspect ratio to generate a new background.
  - `fuse-image`: Takes the matted subject and a selected background to perform the final composition.


