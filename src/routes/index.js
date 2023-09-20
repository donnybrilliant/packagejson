function indexRoutes(app) {
  app.get("/", (req, res) => {
    res.send(`
          <a href="/package.json">package.json</a><br />
          <a href="/repos">repos</a><br />
          <a href="/files">files</a><br/>
          <a href="/netlify">netlify</a>
        `);
  });
}

export default indexRoutes;
