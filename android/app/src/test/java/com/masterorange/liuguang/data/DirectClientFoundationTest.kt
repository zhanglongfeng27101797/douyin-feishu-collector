package com.masterorange.liuguang.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectClientFoundationTest {
    @Test
    fun extractsDouyinUrlFromFullShareText() {
        val source = "2.31 复制打开抖音，看看【流光】测试 https://v.douyin.com/abc123/ 祝你愉快"
        assertEquals("https://v.douyin.com/abc123/", DouyinDirectClient.extractUrl(source))
        assertTrue(DouyinDirectClient.isValid(source))
        assertFalse(DouyinDirectClient.isValid("只有普通文本"))
    }

    @Test
    fun skipsNonDouyinUrlsAndRejectsLookalikeDomains() {
        val source = "说明 https://example.com/help 抖音 https://v.douyin.com/abc123/"
        assertEquals("https://v.douyin.com/abc123/", DouyinDirectClient.extractUrl(source))
        assertFalse(DouyinDirectClient.isValid("https://evildouyin.com/video/1234567890"))
        assertFalse(DouyinDirectClient.isValid("https://v.douyin.com/abc " + "x".repeat(5_000)))
    }

    @Test
    fun parsesFeishuBaseAndSelectedTable() {
        val (appToken, tableId) = parseFeishuBaseReference("https://example.feishu.cn/base/appToken?table=tbl123&view=vew456")
        assertEquals("appToken", appToken)
        assertEquals("tbl123", tableId)
    }

    @Test
    fun removesDouyinAudioTailLikeIos() {
        assertEquals("真正的逐字稿", VolcengineSpeechClient.cleanTranscript("真正的逐字稿。抖音记录美好生活。"))
    }
}
