/** Localize trusted Markdown links during compilation, not after DOM paint. */
export default function remarkLocaleLinks({ site }) {
  return (tree, file) => {
    if (!/(?:^|[/\\])vi[/\\]/.test(file.path || "")) return;
    const origin = new URL(site).origin;
    const visit = (node) => {
      if ((node.type === "link" || node.type === "definition") && node.url) {
        const href = node.url;
        if (!/^(?:#|\?|\/\/|mailto:|tel:|data:)/i.test(href)) {
          const url = new URL(href, site);
          if (
            url.origin === origin &&
            !/^\/(?:api|images|scripts|_astro|assets)(?:\/|$)/.test(url.pathname) &&
            !/\.[^/]+$/.test(url.pathname)
          ) {
            const path = url.pathname.replace(/^\/vi(?=\/|$)/, "").replace(/\/+$/, "");
            url.pathname = `/vi${path}`;
            if (url.searchParams.has("lang")) url.searchParams.set("lang", "vi");
            node.url = `${url.pathname}${url.search}${url.hash}`;
          }
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
