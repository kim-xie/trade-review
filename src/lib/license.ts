/**
 * 授权（买断）接口占位。本次不实现支付与激活码校验。
 * 计划：面包多回调 → 后端二次确认订单 → 签发 Ed25519 激活码 → 前端离线验签（见 README“后续计划”）。
 */
export interface LicenseStatus {
  isPro: boolean;
  /** 激活码（脱敏） */
  maskedCode?: string;
  activatedAt?: string;
}

export interface LicenseProvider {
  getStatus(): Promise<LicenseStatus>;
  activate(code: string): Promise<LicenseStatus>;
  deactivate(): Promise<void>;
}

/** 当前默认实现：始终为免费版。 */
export const freeLicenseProvider: LicenseProvider = {
  async getStatus() {
    return { isPro: false };
  },
  async activate() {
    throw new Error("激活功能尚未开放");
  },
  async deactivate() {},
};
