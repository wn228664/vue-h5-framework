<!-- 未匹配路由的兜底页；replace 避免返回键再次进入不存在的地址。 -->
<template>
  <section class="page-content">
    <van-empty description="页面不存在" /><van-button to="/" replace>返回首页</van-button>
  </section>
</template>
