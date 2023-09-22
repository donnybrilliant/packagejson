/**
 * @function indexRoutes
 * @param {object} app - Express application.
 * @description
 * This function sets up a GET endpoint at the root ("/") of your application.
 * When a GET request is made to this endpoint, the server responds by sending a string of HTML.
 * This string includes 6 clickable links (anchor tags) to different routes in your application:
 * "/package.json", "/repos", "/files", "/netlify", "/vercel", and "/render".
 *
 * @example
 * // Assuming ExpressJS has been initialised as "app"
 * indexRoutes(app);
 */

function indexRoutes(app) {
  app.get("/", (req, res) => {
    res.send(`
          <a href="/package.json">package.json</a><br />
          <a href="/repos">repos</a><br />
          <a href="/files">files</a><br/>
          <a href="/netlify">netlify</a><br/>
          <a href="/vercel">vercel</a><br/>
          <a href="/render">render</a>
        `);
  });
}

export default indexRoutes;
