import SwiftUI

struct TaskDetailView: View {
    @EnvironmentObject private var model: AppModel
    let job: CollectionJob

    var body: some View {
        List {
            Section("状态") {
                LabeledContent("任务状态", value: job.status.title)
                LabeledContent("当前阶段", value: job.stage.title)
                LabeledContent("任务编号", value: job.id)
                if let recordId = job.feishuRecordId, !recordId.isEmpty {
                    LabeledContent("飞书记录", value: recordId)
                }
            }
            Section("提交内容") {
                Text(job.source).textSelection(.enabled)
            }
            if let error = job.errorMessage, !error.isEmpty {
                Section("失败原因") {
                    Text(error).foregroundStyle(.red)
                    if job.canRetry == true {
                        Button("重新提交") {
                            Task { await model.retry(job) }
                        }
                    }
                }
            }
        }
        .navigationTitle(job.title ?? "任务详情")
        .navigationBarTitleDisplayMode(.inline)
    }
}

