export default {
  async fetch(request, environment) {
    if (!environment.ASSETS?.fetch) {
      return new Response("Static asset binding unavailable", { status: 503 });
    }
    let response = await environment.ASSETS.fetch(request);
    const url = new URL(request.url);
    if (response.status === 404 && request.method === "GET" && !url.pathname.includes(".")) {
      url.pathname = "/";
      response = await environment.ASSETS.fetch(new Request(url, request));
    }
    if (response.headers.get("content-type")?.includes("text/html")) {
      const html = (await response.text()).replaceAll("__SITE_ORIGIN__", new URL(request.url).origin);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(html, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  }
};
