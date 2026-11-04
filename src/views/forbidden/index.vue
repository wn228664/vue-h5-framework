<!-- 无权限状态页只显示说明和替换到首页的入口，不承担鉴权或自动重试。 -->
<template>
  <section class="page-content">
    <van-empty description="无访问权限" /><van-button to="/" replace>返回首页</van-button>
  </section>
</template>
