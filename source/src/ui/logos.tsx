import {
  Aws,
  Cisco,
  Database,
  Datadog,
  EdgeColor,
  Elastic,
  GenericHttp,
  GenericRest,
  GenericSyslog,
  Google,
  Kubernetes,
  LakeColor,
  Linux,
  MsAzureSentinel,
  MsWindows,
  NewRelic,
  PaloAlto,
  SearchColor,
  Splunk,
  StreamColor,
  WebHooks,
  AwsS3,
  GenericFileMonitor,
} from '@capra/icons/logos';

type Logo = typeof Splunk;
type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SOURCE_LOGOS: Record<string, Logo> = {
  Windows: MsWindows,
  Linux: Linux,
  Kubernetes: Kubernetes,
  Firewall: PaloAlto,
  Router: Cisco,
  Switch: Cisco,
  'Network Device': GenericSyslog,
  'Cloud (AWS/Azure/GCP)': Aws,
  'SaaS Application': GenericRest,
  'Application Logs': GenericFileMonitor,
  Database: Database,
  'Custom / Other': GenericHttp,
};

const DESTINATION_LOGOS: Record<string, Logo> = {
  Splunk: Splunk,
  'Microsoft Sentinel': MsAzureSentinel,
  S3: AwsS3,
  'Cribl Lake': LakeColor,
  Elasticsearch: Elastic,
  Datadog: Datadog,
  'New Relic': NewRelic,
  Chronicle: Google,
  'Other SIEM': WebHooks,
  Other: WebHooks,
};

export const PRODUCT_LOGOS = { stream: StreamColor, edge: EdgeColor, lake: LakeColor, search: SearchColor };

export function SourceLogo({ type, size = 'md' }: { type: string; size?: LogoSize }) {
  const L = SOURCE_LOGOS[type] ?? GenericHttp;
  return <L size={size} aria-hidden />;
}

export function DestinationLogo({ type, size = 'md' }: { type: string; size?: LogoSize }) {
  const L = DESTINATION_LOGOS[type] ?? WebHooks;
  return <L size={size} aria-hidden />;
}

export function ProductLogo({ product, size = 'md' }: { product: keyof typeof PRODUCT_LOGOS; size?: LogoSize }) {
  const L = PRODUCT_LOGOS[product];
  return <L size={size} aria-hidden />;
}
