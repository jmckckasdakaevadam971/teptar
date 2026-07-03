import type { MetadataRoute } from "next";

/**
 * robots.txt: открываем сайт для индексации, закрываем служебные
 * страницы (личный кабинет, админка, авторизация) и API.
 * Доступен по адресу /robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/my", "/profile", "/login", "/api/"],
      },
    ],
    sitemap: "https://vorhda.ru/sitemap.xml",
  };
}
