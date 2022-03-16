// 存储副作用函数的桶
const bucket = new Set()  // ES6 提供了新的数据结构 Set。它类似于数组，但是成员的值都是唯一的，没有重复的值 https://es6.ruanyifeng.com/#docs/set-map

// 原始数据
const data = { text: 'hello world' }

// 对原始数据的代理
const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 讲副作用函数 effect 添加到存储副作用函数的桶中
        bucket.add(effect)

        // 返回属性值
        return target[key]
    },

    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        // 把副作用函数从桶里取出并执行
        bucket.forEach(fn => fn())

        // 返回 true 代表设置操作成功
        return true
    }
})

// 副作用函数
function effect () {
    document.body.innerText = obj.text
}

// 执行副作用函数
effect()

// 1秒后修改响应式数据
setTimeout(() => {
    obj.text = 'hello vue3'
}, 3000)