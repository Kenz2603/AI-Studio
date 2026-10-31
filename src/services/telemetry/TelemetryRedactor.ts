/**
 * TELEMETRY REDACTOR & OUTPUT SANITIZER (G2.7)
 *
 * - Loại bỏ secret / token / password / API key trước khi lưu SQLite hoặc đẩy sang Renderer.
 * - Loại bỏ mã điều khiển ANSI / ký tự điều khiển (không để output tác động terminal/UI).
 * - Không render HTML: dữ liệu chỉ là text thuần; Renderer hiển thị bằng text node (React escape).
 * - Không bao giờ ghi biến môi trường vào log: giá trị của biến môi trường nhạy cảm đang có trong
 *   process.env cũng được che nếu xuất hiện nguyên văn trong output.
 */

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/g;
// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const SECRET_REGEXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{8,}/g, '[REDACTED_API_KEY]'],
  [/AIza[A-Za-z0-9_-]{15,}/g, '[REDACTED_GOOGLE_KEY]'],
  [/ya29\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_GOOGLE_OAUTH]'],
  [/gh[pousr]_[A-Za-z0-9]{15,}/g, '[REDACTED_GITHUB_TOKEN]'],
  [/github_pat_[A-Za-z0-9_]{22,}/g, '[REDACTED_GITHUB_PAT]'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED_SLACK_TOKEN]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_TOKEN]'],
  [/(?:Authorization\s*:\s*)?Basic\s+[A-Za-z0-9+/=]{8,}/gi, 'Authorization: Basic [REDACTED_CREDENTIAL]'],
  [/:\/\/([^:\s]+):([^@\s]+)@/g, '://$1:[REDACTED_PASSWORD]@'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]'],
  [
    /((?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|token)["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi,
    '$1[REDACTED_SECRET]',
  ],
];

const SENSITIVE_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE)/i;

export const MAX_TELEMETRY_STRING_LENGTH = 4096;
export const MAX_TELEMETRY_PAYLOAD_DEPTH = 6;

export class TelemetryRedactor {
  private envValues: string[] = [];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.refreshEnvValues(env);
  }

  /** Thu thập GIÁ TRỊ (không bao giờ tên + giá trị ra log) của biến môi trường nhạy cảm để che khi xuất hiện */
  public refreshEnvValues(env: NodeJS.ProcessEnv = process.env): void {
    const values: string[] = [];
    for (const [name, value] of Object.entries(env)) {
      if (value && value.length >= 8 && SENSITIVE_ENV_NAME.test(name)) {
        values.push(value);
      }
    }
    // Che giá trị dài trước để tránh che dở
    this.envValues = values.sort((a, b) => b.length - a.length);
  }

  public stripControlSequences(text: string): string {
    return text.replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '');
  }

  public redactText(input: string): string {
    let out = this.stripControlSequences(input);
    for (const value of this.envValues) {
      if (out.includes(value)) {
        out = out.split(value).join('[REDACTED_ENV_VALUE]');
      }
    }
    for (const [pattern, replacement] of SECRET_REGEXES) {
      out = out.replace(pattern, replacement);
    }
    return out;
  }

  /** Giới hạn độ dài + che secret. Trả về số byte đã bị cắt để ghi nhận chính xác. */
  public sanitizeString(
    input: string,
    maxLength = MAX_TELEMETRY_STRING_LENGTH
  ): { text: string; truncatedChars: number } {
    const redacted = this.redactText(input);
    if (redacted.length <= maxLength) {
      return { text: redacted, truncatedChars: 0 };
    }
    return {
      text: redacted.slice(0, maxLength),
      truncatedChars: redacted.length - maxLength,
    };
  }

  /** Làm sạch đệ quy payload (giới hạn độ sâu, độ dài chuỗi, số phần tử); loại hàm / giá trị không serialize được */
  public sanitizePayload(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return this.sanitizeString(value).text;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return Number(value);
    if (depth >= MAX_TELEMETRY_PAYLOAD_DEPTH) return '[TRUNCATED_DEPTH]';
    if (Array.isArray(value)) {
      return value.slice(0, 100).map((item) => this.sanitizePayload(item, depth + 1));
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      let count = 0;
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        if (count++ >= 60) break;
        if (typeof inner === 'function') continue;
        // Không bao giờ giữ lại trường có tên gợi ý secret/env
        if (/^(env|environment|envvars|credentials?|password|secret|token|apikey|api_key)$/i.test(key)) {
          result[key] = '[REDACTED_FIELD]';
          continue;
        }
        result[key] = this.sanitizePayload(inner, depth + 1);
      }
      return result;
    }
    return null;
  }
}

