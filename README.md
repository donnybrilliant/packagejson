# packagejson

## Overview

`packagejson` is a Node.js API service that aggregates and analyzes package.json files across your GitHub repositories, while also providing deployment information from various hosting platforms. It helps developers track dependencies, versions, and deployments across multiple projects.

### Key Features

- **GitHub Integration**:

  - Fetches all repositories and their package.json files
  - Analyzes dependencies across projects
  - Provides folder structure navigation
  - Supports binary file handling (images, videos, etc.)

- **Deployment Platform Integration**:
  - Netlify deployments and site information
  - Vercel project details
  - Render service status
- **API Features**:
  - RESTful endpoints with HTML/JSON responses
  - Swagger documentation at `/docs`
  - Caching for improved performance
  - Comprehensive error handling and logging

## Installation

1. Clone the repository:

```bash
git clone https://github.com/donnybrilliant/packagejson.git
```

2. Install dependencies:

```bash
cd packagejson
npm install
```

3. Configure environment variables:

   - Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

   - Update the `.env` file with your credentials:

     ```
     # Required
     USERNAME=your_github_username
     GITHUB_TOKEN=your_github_personal_access_token

     # Optional - for deployment platform integration
     NETLIFY_TOKEN=your_netlify_token
     VERCEL_TOKEN=your_vercel_token
     RENDER_TOKEN=your_render_token

     # Server configuration (optional)
     PORT=3000
     NODE_ENV=development
     ```

## Usage

### Starting the Server

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

### API Endpoints

- `/` - Home page with navigation links
- `/package.json` - Aggregated dependency information across repositories
- `/repos` - List of your GitHub repositories
- `/files` - File structure navigation across repositories
- `/netlify` - Netlify deployment information
- `/vercel` - Vercel project details
- `/render` - Render service status
- `/docs` - Swagger API documentation

### Documentation

Generate JSDoc documentation:

```bash
npm run docs
```

Access the documentation in the `docs/` directory.

## Configuration

Key configuration options in `config/index.js`:

```javascript
const USE_LOCAL_DATA = false; // Use cached data instead of fetching
const SAVE_FILE = true; // Save fetched data to file
const ONLY_SAVE_LINKS = true; // Only save links to binary files
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
