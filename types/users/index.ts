export type TabType = 'users' | 'usergroups' | 'ips';

export interface UserRow {
  id: number;
  user: string;
  admin: "Yes" | "No";
  localAuth: "Yes" | "No";
  lastLogOn: string;
  groups: string;
}

export interface UserGroupRow {
  id: number;
  group: string;
  description: string;
  members: number;
  viewableReports: string;
  dashboardWidgets: string;
}

export interface IpAddressRow {
  id: number;
  ipAddress: string;
  description: string;
}

export interface NewIpAddress {
  ipAddress: string;
  description: string;
}