# packagejson

## Overview

`packagejson` is a Node.js API service that aggregates and analyzes package.json files across your GitHub repositories, while also providing comprehensive repository analytics, deployment information, and CI/CD status from various hosting platforms. It helps developers track dependencies, versions, deployments, and contribution activity across multiple projects.

### Key Features

- **Enhanced GitHub Integration**:

  - Fetches all repositories with comprehensive metadata
  - Analyzes dependencies across projects with version aggregation
  - README content extraction for repository descriptions
  - Complete language statistics (not just primary language)
  - Contribution activity data (commit activity, contributors, code frequency)
  - GitHub Actions workflows and CI/CD status
  - Deployment information and status
  - NPM package links with automatic detection
  - Provides folder structure navigation
  - Supports binary file handling (images, videos, etc.)

- **Deployment Platform Integration**:

  - **Automatic Deployment Links**: Automatically matches repositories to deployments on:
    - Netlify deployments and site information
    - Vercel project details with framework detection
    - Render service status
  - Manual platform endpoints for direct access

- **NPM Package Registry Integration**:
  - **Automatic Package Detection**: Checks if packages from repositories are published on npmjs
    - Extracts package name from package.json
    - Queries npmjs registry API to verify package existence
    - Retrieves published package metadata (version, description, keywords, etc.)
    - Detects CI/CD workflows that automate npm publishing
  - Direct npmjs endpoint for querying any package: `/npmjs/:packageName`
- **API Features**:
  - RESTful endpoints with HTML/JSON responses
  - Flexible query parameters for data filtering
  - Swagger documentation at `/docs`
  - Intelligent caching for improved performance
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

     # Note: npmjs integration doesn't require authentication
     # The npmjs registry API is public and accessible without tokens

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

#### Basic Endpoints

- `/` - Home page with navigation links
- `/package.json` - Aggregated dependency information across repositories
  - Query parameters: `version` (min, max, default: max)
- `/package.json/refresh` - Refresh cached package data
- `/files` - File structure navigation across repositories
- `/docs` - Swagger API documentation

#### Repository Endpoints

**Collection Endpoint:**

- `GET /repos` - List repositories with optional filtering and field selection

  **Query Parameters:**

  - `type` (string, default: "public") - Filter by visibility: `all`, `public`, or `private`
  - `include` (string) - Comma-separated list of fields to include: `readme`, `languages`, `stats`, `releases`, `workflows`, `cicd`, `deployments`, `npm`, `deployment-links`
  - `fields` (string) - Comma-separated list of specific fields to return (field selection)
  - `sort` (string, default: "updated") - Sort by: `updated`, `stars`, or `name`
  - `limit` (integer, default: 100) - Maximum number of repositories to return
  - `offset` (integer, default: 0) - Number of repositories to skip (pagination)

  **Examples:**

  ```bash
  # Basic repository list
  GET /repos

  # All repositories (public and private)
  GET /repos?type=all

  # Include specific fields
  GET /repos?include=readme,languages,stats

  # Select only specific fields
  GET /repos?fields=name,description,stars,languages

  # Sort by stars and paginate
  GET /repos?sort=stars&limit=20&offset=0
  ```

**Single Repository Endpoint:**

- `GET /repos/:owner/:repo` - Get detailed information about a specific repository

  **Query Parameters:**

  - `include` (string) - Comma-separated list of fields to include (if not specified, includes all by default)
  - `fields` (string) - Comma-separated list of specific fields to return

  **Examples:**

  ```bash
  # Get full repository details
  GET /repos/username/repo-name

  # Get only specific fields
  GET /repos/username/repo-name?fields=name,description,stars,languages

  # Include only certain expensive fields
  GET /repos/username/repo-name?include=readme,stats
  ```

**Nested Resource Endpoints:**

- `GET /repos/:owner/:repo/readme` - Get README content
- `GET /repos/:owner/:repo/languages` - Get language statistics
- `GET /repos/:owner/:repo/stats` - Get contribution statistics
  - Query: `include` - Comma-separated: `commit_activity`, `contributors`, `code_frequency`, `participation`
- `GET /repos/:owner/:repo/releases` - Get releases
  - Query: `limit` (default: 10)
- `GET /repos/:owner/:repo/workflows` - Get GitHub Actions workflows
- `GET /repos/:owner/:repo/workflows/runs` - Get workflow runs
  - Query: `limit` (default: 10)
- `GET /repos/:owner/:repo/cicd` - Get CI/CD status
- `GET /repos/:owner/:repo/deployments` - Get deployments
  - Query: `limit` (default: 10)
- `GET /repos/:owner/:repo/npm` - Get NPM package information
- `GET /repos/:owner/:repo/deployment-links` - Get deployment links from external platforms

**Examples:**

```bash
# Get README for a specific repo
GET /repos/username/repo-name/readme

# Get language statistics
GET /repos/username/repo-name/languages

# Get only commit activity stats
GET /repos/username/repo-name/stats?include=commit_activity

# Get recent releases
GET /repos/username/repo-name/releases?limit=5
```

#### Deployment Platform Endpoints

- `/netlify` - Netlify deployment information (requires NETLIFY_TOKEN)
- `/vercel` - Vercel project details (requires VERCEL_TOKEN)
- `/render` - Render service status (requires RENDER_TOKEN)

**Note:** Deployment links are automatically included in enhanced repository data when platform tokens are configured.

#### NPM Package Registry Endpoints

- `GET /npmjs/:packageName` - Get npmjs package information for a specific package

  - Query parameter: `latest` (boolean, default: false) - If true, returns only latest version information (faster)

  **Examples:**

  ```bash
  # Get full package information
  GET /npmjs/express

  # Get only latest version (faster)
  GET /npmjs/express?latest=true
  ```

**Note:** NPM package information is automatically included in repository data when a package.json file is present. The system checks if the package exists on npmjs and retrieves published package metadata.

### Repository Data Structure

When fetching repository data, the response follows a consistent structure:

**Collection Response:**

```json
{
  "data": [...],
  "meta": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

**Single Resource Response:**

```json
{
  "data": {
    "name": "repo-name",
    "full_name": "owner/repo-name",
    ...
  },
  "_links": {
    "readme": "/repos/owner/repo-name/readme",
    "languages": "/repos/owner/repo-name/languages",
    ...
  }
}
```

**Available Repository Fields:**

#### Basic Information

- Repository name, description, URLs
- Stars, forks, watchers, open issues
- Created, updated, and pushed dates
- Topics/tags, license information
- Default branch, repository size

#### README Content

- Full README content extracted from repository
- Supports multiple README filename formats

#### Language Statistics

- All languages used in the repository (not just primary)
- Byte counts for each language
- Useful for repositories without package.json

#### Contribution Statistics

- **Commit Activity**: Weekly commit activity for the last year
- **Contributors**: Contributor statistics with commit counts
- **Code Frequency**: Additions and deletions per week
- **Participation**: All commits vs owner commits breakdown

#### GitHub Actions & CI/CD

- **Workflows**: List of all GitHub Actions workflows
- **Workflow Runs**: Recent workflow runs with status and conclusions
- **CI/CD Status**: Latest CI/CD run status, conclusion, and links

#### Deployments

- **GitHub Deployments**: Deployment information with statuses
- **External Platform Links**: Automatic matching to:
  - Netlify sites (with SSL URL)
  - Vercel projects (with framework detection)
  - Render services

#### NPM Package Information

The npmjs integration works similarly to deployment platform integration, but queries the npmjs registry API to verify if packages are published:

- **Package Detection**: Extracts package name from package.json
- **npmjs API Integration**: Queries npmjs registry to verify if package exists and get published metadata
- **CI/CD Workflow Detection**: Automatically detects GitHub Actions workflows that publish to npm
- **Published Package Data**: If package exists on npmjs, includes:
  - Published version (may differ from package.json version)
  - Package description, homepage, repository
  - Keywords, license, author, maintainers
  - Distribution tags (latest, beta, etc.)
  - Total number of published versions
  - Latest version publication date

**How it works:**

1. Extracts package name from repository's package.json
2. Queries npmjs registry API (`https://registry.npmjs.org/{packageName}`)
3. Checks GitHub Actions workflows for npm publish automation
4. Returns combined information about local package.json and published npmjs package

**Note:** Unlike deployment platforms, npmjs doesn't provide a "list all packages" endpoint, so we query by package name extracted from each repository's package.json.

### Example Responses

**Collection Response:**

```json
{
  "data": [
    {
      "name": "my-repo",
      "full_name": "username/my-repo",
      "description": "My awesome project",
      "stars": 42,
      "forks": 10,
      "languages": {
        "JavaScript": 50000,
        "TypeScript": 30000
      }
    }
  ],
  "meta": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

**Single Repository with All Fields:**

```json
{
  "data": {
    "name": "my-repo",
    "full_name": "username/my-repo",
    "description": "My awesome project",
    "stars": 42,
    "forks": 10,
    "languages": {
      "JavaScript": 50000,
      "TypeScript": 30000,
      "CSS": 5000
    },
    "readme": "# My Awesome Project\n...",
    "stats": {
      "commit_activity": [...],
      "contributors": [...],
      "code_frequency": [...],
      "participation": {...}
    },
    "workflows": [...],
    "workflow_runs": {...},
    "cicd_status": {
      "status": "completed",
      "conclusion": "success",
      "html_url": "https://github.com/..."
    },
    "deployments": [...],
    "deployment_links": {
      "netlify": {
        "name": "my-site",
        "url": "https://my-site.netlify.app"
      },
      "vercel": {
        "name": "my-project",
        "url": "https://my-project.vercel.app",
        "framework": "nextjs"
      }
    },
    "npm": {
      "package_name": "my-package",
      "version": "1.0.0",
      "npm_link": "https://www.npmjs.com/package/my-package",
      "has_npm_publish_workflow": true,
      "npm_publish_workflow": {
        "id": 123456,
        "name": "Publish to npm",
        "path": ".github/workflows/publish.yml",
        "state": "active",
        "html_url": "https://github.com/..."
      },
      "repository": {
        "type": "git",
        "url": "https://github.com/username/my-repo.git"
      },
      "npmjs": {
        "exists": true,
        "published_version": "1.2.0",
        "description": "My awesome package",
        "homepage": "https://example.com",
        "repository": {
          "type": "git",
          "url": "https://github.com/username/my-repo.git"
        },
        "keywords": ["package", "npm", "awesome"],
        "license": "MIT",
        "author": "John Doe",
        "maintainers": [...],
        "latest_version_published": "2024-01-15T10:30:00.000Z",
        "dist_tags": {
          "latest": "1.2.0",
          "beta": "2.0.0-beta.1"
        },
        "total_versions": 15
      }
    }
  },
  "_links": {
    "readme": "/repos/username/my-repo/readme",
    "languages": "/repos/username/my-repo/languages",
    "stats": "/repos/username/my-repo/stats",
    "releases": "/repos/username/my-repo/releases",
    "workflows": "/repos/username/my-repo/workflows",
    "cicd": "/repos/username/my-repo/cicd",
    "deployments": "/repos/username/my-repo/deployments",
    "npm": "/repos/username/my-repo/npm",
    "deployment-links": "/repos/username/my-repo/deployment-links"
  }
}
```

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

### Caching

- Package data: Cached for 1 week
- File structure: Cached for 1 month
- Deployment platform data: Cached for 1 hour (shared across requests)
- npmjs package data: Fetched on-demand (no caching, as npmjs registry is public and fast)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
