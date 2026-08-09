import SwiftUI

enum SetupGuideTopic: String, CaseIterable, Identifiable {
    case feishuApplication
    case feishuBase
    case volcengineSpeech

    var id: String { rawValue }

    var title: String {
        switch self {
        case .feishuApplication: "创建飞书应用"
        case .feishuBase: "准备多维表格"
        case .volcengineSpeech: "开通火山语音"
        }
    }

    var subtitle: String {
        switch self {
        case .feishuApplication: "App ID、App Secret、权限与发布"
        case .feishuBase: "表格链接与应用协作者"
        case .volcengineSpeech: "录音文件识别极速版 API Key"
        }
    }

    var symbol: String {
        switch self {
        case .feishuApplication: "building.2"
        case .feishuBase: "tablecells"
        case .volcengineSpeech: "waveform.badge.mic"
        }
    }
}

struct SetupGuideIndexView: View {
    var body: some View {
        List {
            Section {
                ForEach(SetupGuideTopic.allCases) { topic in
                    NavigationLink {
                        SetupGuideView(topic: topic)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(topic.title).font(.headline)
                                Text(topic.subtitle).font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: topic.symbol).foregroundStyle(.tint)
                        }
                    }
                }
            } header: {
                Text("按顺序完成")
            } footer: {
                Text("每个账号都由使用者自己注册。流光不会替你创建共享密钥，也不会把凭证上传给开发者。")
            }
        }
        .navigationTitle("配置教程")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SetupGuideView: View {
    let topic: SetupGuideTopic

    var body: some View {
        List {
            switch topic {
            case .feishuApplication:
                feishuApplicationGuide
            case .feishuBase:
                feishuBaseGuide
            case .volcengineSpeech:
                volcengineGuide
            }
        }
        .navigationTitle(topic.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var feishuApplicationGuide: some View {
        GuideIntro(
            text: "飞书自建应用代表你自己的账号访问多维表格。流光使用 App ID 和 App Secret 获取应用身份凭证。"
        )
        Section("操作步骤") {
            GuideStep(number: 1, title: "创建企业自建应用", detail: "打开飞书开放平台，进入开发者后台，选择“创建企业自建应用”。应用名可填“流光采集助手”。")
            GuideStep(number: 2, title: "复制 App ID 和 App Secret", detail: "左侧进入“凭证与基础信息”。App ID 一般以 cli_ 开头；App Secret 是密钥，不要发给其他人。")
            GuideStep(number: 3, title: "开通多维表格权限", detail: "进入“权限管理”，搜索并开通“查看、评论、编辑和管理多维表格”（bitable:app）。该权限覆盖读取数据表与字段、新增及更新记录。")
            GuideStep(number: 4, title: "创建并发布版本", detail: "进入“版本管理与发布”，创建版本并提交。如果组织要求审核，需等企业管理员审批通过。")
        }
        Section("官方入口") {
            Link("打开飞书开发者后台", destination: GuideURL.feishuConsole)
            Link("查看飞书 API 权限列表", destination: GuideURL.feishuScopes)
        }
        GuideWarning(text: "只创建应用还不够：权限变更后必须再创建并发布一个新版本，否则权限不会生效。")
    }

    @ViewBuilder
    private var feishuBaseGuide: some View {
        GuideIntro(
            text: "多维表格是采集结果的存放位置。除了粘贴链接，还要让刚创建的飞书应用拥有这份表格的编辑权限。"
        )
        Section("操作步骤") {
            GuideStep(number: 1, title: "创建或复制多维表格", detail: "在飞书中新建多维表格，或复制已经准备好的流光表格模板。目标数据表建议命名为“采集库”。")
            GuideStep(number: 2, title: "复制完整表格链接", detail: "打开表格后点“分享”或复制浏览器地址。链接应包含 /base/；如地址中带 table=tbl... 还可精确指定数据表。")
            GuideStep(number: 3, title: "把应用添加为协作者", detail: "在表格右上角点“…”或“分享”，进入协作者设置，选择“添加文档应用”，搜索你刚发布的应用，设为可编辑。")
            GuideStep(number: 4, title: "返回流光粘贴链接", detail: "流光会自动识别 Base App Token；链接未指定数据表时，优先寻找“采集库”，否则使用第一张表。")
        }
        Section("官方说明") {
            Link("查看多维表格 OpenAPI 接入说明", destination: GuideURL.feishuBaseOverview)
        }
        GuideWarning(text: "如果出现 HTTP 403，最常见的原因是应用未加为该表格的协作者，或多维表格权限尚未随新版本发布。")
    }

    @ViewBuilder
    private var volcengineGuide: some View {
        GuideIntro(
            text: "火山引擎负责把抖音视频的音频转换成逐字稿。当前流光接入的是“录音文件识别大模型·极速版”。"
        )
        Section("操作步骤") {
            GuideStep(number: 1, title: "注册并登录火山引擎", detail: "进入豆包语音控制台。新账号按页面提示完成实名或服务开通。")
            GuideStep(number: 2, title: "创建语音应用", detail: "在旧版“应用管理”中创建应用，名称可填 douyin_collector 或“流光采集助手”。")
            GuideStep(number: 3, title: "勾选正确能力", detail: "找到“录音文件识别大模型”，只需勾选“极速版”，然后保存应用。")
            GuideStep(number: 4, title: "在快捷 API 接入中选择密钥", detail: "进入“快捷 API 接入”，新建或选择当前应用的 API Key。点小眼睛复制完整值，粘贴到流光。")
        }
        Section("官方入口") {
            Link("打开火山引擎豆包语音控制台", destination: GuideURL.volcengineConsole)
            Link("查看极速版 API 文档", destination: GuideURL.volcengineFlashDoc)
        }
        GuideWarning(text: "请粘贴“API Key”的完整内容，不要填 App ID，也不要把密钥发到聊天、截图或公开仓库。")
    }
}

struct GuideEntryLabel: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "questionmark.circle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline).foregroundStyle(.primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
        }
        .padding(16)
        .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct GuideIntro: View {
    let text: String

    var body: some View {
        Section {
            Label {
                Text(text)
            } icon: {
                Image(systemName: "info.circle.fill").foregroundStyle(.tint)
            }
        }
    }
}

private struct GuideStep: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            Text("\(number)")
                .font(.subheadline.bold().monospacedDigit())
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Color.accentColor, in: Circle())
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct GuideWarning: View {
    let text: String

    var body: some View {
        Section("容易遗漏") {
            Label(text, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
        }
    }
}

private enum GuideURL {
    static let feishuConsole = URL(string: "https://open.feishu.cn/app")!
    static let feishuScopes = URL(string: "https://open.feishu.cn/document/server-docs/application-scope/scope-list?lang=zh-CN")!
    static let feishuBaseOverview = URL(string: "https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN")!
    static let volcengineConsole = URL(string: "https://console.volcengine.com/speech")!
    static let volcengineFlashDoc = URL(string: "https://www.volcengine.com/docs/6561/1631584?lang=zh")!
}
