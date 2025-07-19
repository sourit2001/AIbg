// 用于 Supabase OAuth 登录回调（如需自定义逻辑可扩展）
export async function GET(req) {
  return Response.redirect("/");
}
