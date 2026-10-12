import { dirname } from 'node:path';

export const LABEL = 'com.lifetracker.server';

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

export function renderPlist({ label, nodePath, repoDir, dataDir, port, publicOrigin }) {
  const env = [
    ['NODE_ENV', 'production'],
    ['LT_DATA_DIR', dataDir],
    ['LT_PORT', String(port)],
    ...(publicOrigin ? [['LT_PUBLIC_ORIGIN', publicOrigin]] : []),
    ['PATH', `${dirname(nodePath)}:/usr/bin:/bin`],
  ]
    .map(([k, v]) => `\t\t<key>${escapeXml(k)}</key>\n\t\t<string>${escapeXml(v)}</string>`)
    .join('\n');
  const args = [nodePath, '--import', 'tsx', `${repoDir}/server/src/index.ts`]
    .map((a) => `\t\t<string>${escapeXml(a)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${escapeXml(label)}</string>
\t<key>ProgramArguments</key>
\t<array>
${args}
\t</array>
\t<key>WorkingDirectory</key>
\t<string>${escapeXml(repoDir)}</string>
\t<key>EnvironmentVariables</key>
\t<dict>
${env}
\t</dict>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${escapeXml(dataDir)}/logs/launchd.out.log</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(dataDir)}/logs/launchd.err.log</string>
</dict>
</plist>
`;
}

/** Reads back the user-facing options from a plist written by renderPlist. */
export function parsePlistOptions(xml) {
  const get = (key) => {
    const m = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
    return m ? unescapeXml(m[1]) : undefined;
  };
  const port = get('LT_PORT');
  return {
    dataDir: get('LT_DATA_DIR'),
    port: port === undefined ? undefined : Number(port),
    publicOrigin: get('LT_PUBLIC_ORIGIN'),
  };
}
