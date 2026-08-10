package com.masterorange.liuguang.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FeishuCollectionRecordTest {
    @Test
    fun onlyExposesHttpsLinksToTheUi() {
        val record = FeishuCollectionRecord(
            id = "record-1",
            fields = listOf(
                FeishuRecordField("安全封面", "", links = listOf("https://example.com/cover.jpg")),
                FeishuRecordField("不安全封面", "http://127.0.0.1/private.jpg"),
            ),
        )

        assertEquals("https://example.com/cover.jpg", record.link("安全封面"))
        assertNull(record.link("不安全封面"))
    }
}
