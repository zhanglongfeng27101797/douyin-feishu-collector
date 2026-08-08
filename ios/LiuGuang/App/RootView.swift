import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.isConfigured {
                MainTabView()
            } else {
                OnboardingView()
            }
        }
        .animation(.easeInOut, value: model.isConfigured)
    }
}

private struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack { SubmitView() }
                .tabItem { Label("采集", systemImage: "paperplane.fill") }
            NavigationStack { TaskListView() }
                .tabItem { Label("任务", systemImage: "list.bullet.rectangle") }
            NavigationStack { SettingsView() }
                .tabItem { Label("设置", systemImage: "gearshape.fill") }
        }
        .tint(Color.accentColor)
    }
}

