package com.masterorange.liuguang.domain

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UserServiceConfigurationTest {
    @Test
    fun acceptsTheSameFeishuBaseUrlsAsIos() {
        assertTrue(UserServiceConfiguration.isFeishuBaseUrl("https://example.feishu.cn/base/appToken?table=tbl123"))
        assertTrue(UserServiceConfiguration.isFeishuBaseUrl("https://example.larksuite.com/base/appToken"))
        assertFalse(UserServiceConfiguration.isFeishuBaseUrl("http://example.feishu.cn/base/appToken"))
        assertFalse(UserServiceConfiguration.isFeishuBaseUrl("https://example.feishu.cn/wiki/token"))
        assertFalse(UserServiceConfiguration.isFeishuBaseUrl("https://evil.example/base/token"))
    }

    @Test
    fun completeConfigurationNormalizesWhitespace() {
        val value = UserServiceConfiguration(
            " cli_test ",
            " secret ",
            " https://example.feishu.cn/base/appToken ",
            SpeechProvider.VOLCENGINE,
            " speech-key ",
        ).normalized()
        assertTrue(value.feishuAppId == "cli_test")
        assertTrue(value.speechApiKey == "speech-key")
    }
}
