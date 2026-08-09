import SwiftUI
import UIKit

struct TeleprompterEditorView: View {
    @StateObject private var store = TeleprompterDraftStore()
    @State private var draft = TeleprompterDraft(title: "", content: "")
    @State private var showDrafts = false
    @State private var showPlayer = false
    @State private var savedNotice = false

    var body: some View {
        Form {
            Section("文稿") {
                TextField("标题（可选）", text: $draft.title)
                TextEditor(text: $draft.content)
                    .frame(minHeight: 300)
                    .overlay(alignment: .topLeading) {
                        if draft.content.isEmpty {
                            Text("粘贴或输入提词内容……")
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .padding(.leading, 5)
                                .allowsHitTesting(false)
                        }
                    }
                HStack {
                    Text("\(draft.content.count) 字")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("粘贴") {
                        draft.content = UIPasteboard.general.string ?? draft.content
                    }
                    Button("存草稿") { saveDraft() }
                        .disabled(draft.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            Section {
                Button {
                    saveDraft()
                    showPlayer = true
                } label: {
                    HStack {
                        Spacer()
                        Label("开始提词", systemImage: "play.fill")
                        Spacer()
                    }
                }
                .disabled(draft.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section("草稿箱") {
                if store.drafts.isEmpty {
                    Text("还没有保存的草稿")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.drafts.prefix(5)) { item in
                        Button {
                            draft = item
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.title.isEmpty ? preview(item.content) : item.title)
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                Text("\(item.updatedAt.formatted(date: .numeric, time: .shortened)) · \(item.content.count) 字")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("查看全部草稿") { showDrafts = true }
                }
            }
        }
        .navigationTitle("提词器")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showDrafts) {
            NavigationStack {
                TeleprompterDraftListView(store: store) { selected in
                    draft = selected
                    showDrafts = false
                }
            }
        }
        .fullScreenCover(isPresented: $showPlayer) {
            TeleprompterPlayerView(text: draft.content)
        }
        .overlay(alignment: .bottom) {
            if savedNotice {
                Text("已保存至草稿箱")
                    .font(.callout.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private func saveDraft() {
        if draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            draft.title = preview(draft.content)
        }
        store.save(draft)
        withAnimation { savedNotice = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation { savedNotice = false }
        }
    }

    private func preview(_ text: String) -> String {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? "未命名文稿" : String(value.prefix(28))
    }
}

private struct TeleprompterDraftListView: View {
    @ObservedObject var store: TeleprompterDraftStore
    let onSelect: (TeleprompterDraft) -> Void

    var body: some View {
        List {
            ForEach(store.drafts) { draft in
                Button { onSelect(draft) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(draft.title).foregroundStyle(.primary).lineLimit(1)
                        Text("\(draft.updatedAt.formatted(date: .numeric, time: .shortened)) · \(draft.content.count) 字")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { store.delete(draft) } label: {
                        Label("删除", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("草稿箱")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("关闭") { dismiss() }
            }
        }
    }

    @Environment(\.dismiss) private var dismiss
}
