function indexRoutes(app) {
  app.get("/", (req, res) => {
    res.send(`
          <a href="/package.json">package.json</a><br>
          <a href="/repos">repos</a>
          <a href="/files">files</a>
        `);
  });
}

export default indexRoutes;
