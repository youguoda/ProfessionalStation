import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTTP Basic Auth 中间件：应用本身零鉴权（单用户设计），对外部署时
 * 这一层是它的门。生产部署由 Nginx basic auth 承担；开发实例直接
 * 暴露端口时，设置 PS_AUTH_USER / PS_AUTH_PASS 即可在这里兜底。
 *
 * 两个变量都未设置时完全放行——保持本地开发零摩擦。
 */

export const config = {
  // 放行构建产物与图标，其余（页面 + 全部 API）都要求认证
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const user = process.env.PS_AUTH_USER;
  const pass = process.env.PS_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`${user}:${pass}`)}`;
  // 单用户内网场景的挡门作用，不做恒时比较
  if (header === expected) return NextResponse.next();

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ProfessionalStation", charset="UTF-8"' },
  });
}
