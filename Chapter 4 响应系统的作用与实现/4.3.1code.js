// 存储副作用函数的桶
const bucket = new Set()  // ES6 提供了新的数据结构 Set。它类似于数组，但是成员的值都是唯一的，没有重复的值 https://es6.ruanyifeng.com/#docs/set-map

// 用一个全局变量存储被注册的副作用函数
let activeEffect

// effect 函数用于注册副作用函数
function effect (fn) {
    // 当调用 effect 注册副作用函数时，将副作用函数 fn 复制给 activeEffect
    activeEffect = fn

    // 执行副作用函数
    fn()
}

// 原始数据
const data = { text: 'hello world' }

// 对原始数据的代理
const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 将 activeEffect 中存储的副作用函数手机到“桶”中
        if (activeEffect) {
            bucket.add(activeEffect) // 新增
        }

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

// 注册副作用函数
effect(
    // 匿名副作用函数
    () => {
        console.log('effect run')
        document.body.innerText = obj.text
    }
)

// 1秒后修改响应式数据
setTimeout(() => {
    obj.text = 'hello vue3'
}, 2000)

setTimeout(() => {
    // 副作用函数中并没有读取 notExist 属性的值
    obj.notExist = 'hello vue3'
}, 2000)