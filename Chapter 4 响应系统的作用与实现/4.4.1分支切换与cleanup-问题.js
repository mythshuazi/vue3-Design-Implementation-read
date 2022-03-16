// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap

// 存储副作用函数的桶
const bucket = new WeakMap()

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
const effect = (fn) => {
    // 当调用 effect 注册副作用函数时，将副作用函数 fn 复制给 activeEffect
    activeEffect = fn

    // 执行副作用函数
    fn()
}

// 原始数据
const data = { ok: true, text: 'hello world' }

const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
        track(target, key)

        // 返回属性值
        return target[key]
    },

    // 拦截设置操作
    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        // 把副作用函数从桶里取出并执行
        trigger(target, key)
    }
})

// 在 get 拦截函数内调用 track 函数追踪变化
function track (target, key) {
    // 没有 activeEffect ，直接 return
    if (!activeEffect) return

    let depsMap = bucket.get(target)

    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger (target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)
    effects && effects.forEach(fn => fn())
}




// 注册副作用函数
effect(
    // 匿名副作用函数
    () => {
        console.log('effect run')
        document.body.innerText = obj.ok ? obj.text : 'not'
    }
)

/**
 * 疑问：
 * 每次读取 data 的属性操作都会走到 get 里，deps 每次都会 add activeEffect 副作用函数，
 * 但打印出 bukect 查看 deps 列表只有一个，原因在于，set 数据结构不会添加重复的值
 * 
 * 问题：
 * 当obj.ok 为 false 时，document.body.innerText 值始终为 not，
 * 理想的结果是修改 obj.text 的值，不会执行其相关的副作用函数。
 * 目前以上代码还做不到
 */