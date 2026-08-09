import SwiftUI

struct CollectionRecordDetailView: View {
    let record: FeishuCollectionRecord

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                header

                ForEach(record.fields.filter { !$0.isEmpty }) { field in
                    RecordFieldView(field: field)
                }
            }
            .padding(16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(record.status)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = record.link("标准链接", "原始链接") {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                CoverImage(url: record.coverURL)
                    .frame(width: 96, height: 128)
                VStack(alignment: .leading, spacing: 8) {
                    Label(record.status, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(record.status.contains("成功") ? .green : .orange)
                        .font(.subheadline.weight(.semibold))
                    Text(record.title)
                        .font(.title3.bold())
                    if let author = record.text("博主") {
                        Label(author, systemImage: "person.crop.circle")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack(spacing: 8) {
                if let highlight = record.highlight { HighlightBadge(text: highlight) }
                if let benchmark = record.benchmark {
                    Text(benchmark)
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.secondary.opacity(0.1), in: Capsule())
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct RecordFieldView: View {
    let field: FeishuRecordField

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(field.name, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            if isTagField && field.values.count > 1 {
                FlowLayout(spacing: 7) {
                    ForEach(field.values, id: \.self) { value in
                        Text(value)
                            .font(.subheadline)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(tagColor(value).opacity(0.18), in: Capsule())
                    }
                }
            } else if let link = field.links.first, field.text.count < 500 {
                Link(destination: link) {
                    Text(field.text)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                Text(field.text)
                    .font(.body)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var isTagField: Bool {
        ["话题标签", "钩子类型", "分类", "爆款"].contains(field.name)
    }

    private var icon: String {
        if field.name.contains("链接") || !field.links.isEmpty { return "link" }
        if field.name.contains("时间") { return "calendar" }
        if field.name.contains("逐字稿") { return "text.quote" }
        if field.name.contains("封面") || field.name.contains("附件") { return "paperclip" }
        if isTagField { return "tag" }
        return "text.alignleft"
    }

    private func tagColor(_ value: String) -> Color {
        let colors: [Color] = [.blue, .mint, .orange, .purple, .pink, .green]
        return colors[abs(value.hashValue) % colors.count]
    }
}

private struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, point) in result.points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        let width = proposal.width ?? 320
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return (CGSize(width: width, height: y + rowHeight), points)
    }
}
